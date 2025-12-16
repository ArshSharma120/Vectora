from flask import Flask, request, jsonify, render_template, Response, stream_with_context
from flask_cors import CORS
import requests
import re
import sys
import os
import json
import base64
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

# Optional PDF support
try:
    from pdf2image import convert_from_path
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False

load_dotenv()

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app)

# DATA DIRS
UPLOAD_FOLDER = 'tmp_uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ✅ API Keys
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# Base URLs
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
GROQ_BASE_URL = "https://api.groq.com/openai/v1"


def extract_probability(text):
    if not text: return None
    match = re.search(r"(\d{1,3}) ?%", text)
    if match: return int(match.group(1))
    return None

# --- GEMINI HELPERS ---

def upload_to_gemini(file_path, mime_type):
    """Uploads file to Gemini Files API and returns file_uri."""
    file_size = os.path.getsize(file_path)
    display_name = os.path.basename(file_path)
    
    # 1. Initial Resumable Request
    url = f"{GEMINI_BASE_URL}/upload/v1beta/files"
    headers = {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": str(file_size),
        "X-Goog-Upload-Header-Content-Type": mime_type,
        "Content-Type": "application/json"
    }
    params = {"key": GEMINI_API_KEY}
    data = {"file": {"display_name": display_name}}
    
    req1 = requests.post(url, headers=headers, params=params, json=data)
    upload_url = req1.headers.get("X-Goog-Upload-URL")
    
    if not upload_url:
        raise Exception(f"Failed to get upload URL: {req1.text}")
        
    # 2. Upload Bytes
    with open(file_path, "rb") as f:
        headers2 = {
            "Content-Length": str(file_size),
            "X-Goog-Upload-Offset": "0",
            "X-Goog-Upload-Command": "upload, finalize"
        }
        req2 = requests.post(upload_url, headers=headers2, data=f)
    
    if req2.status_code != 200:
        raise Exception(f"File upload failed: {req2.text}")
        
    file_info = req2.json()
    return file_info["file"]["uri"]

def stream_gemini(prompt, model, file_uri=None, mime_type=None, web_search=False):
    # Prepare URL
    if not model.startswith("models/") and not model.startswith("tunedModels/"):
         model_path = f"models/{model}"
    else:
         model_path = model

    url = f"{GEMINI_BASE_URL}/{model_path}:streamGenerateContent?alt=sse"
    params = {"key": GEMINI_API_KEY}
    headers = {"Content-Type": "application/json"}
    
    parts = [{"text": prompt}]
    if file_uri:
        parts.insert(0, {"file_data": {"mime_type": mime_type, "file_uri": file_uri}})
    
    contents = [{"parts": parts}]
    
    tools = []
    if web_search:
        tools.append({"googleSearch": {}})
        
    payload = {"contents": contents}
    if tools:
        payload["tools"] = tools

    # Request
    with requests.post(url, headers=headers, params=params, json=payload, stream=True) as resp:
        for line in resp.iter_lines():
            if line:
                decoded_line = line.decode('utf-8')
                if decoded_line.startswith("data:"):
                    json_str = decoded_line[5:].strip()
                    try:
                        chunk = json.loads(json_str)
                        text_chunk = chunk["candidates"][0]["content"]["parts"][0]["text"]
                        yield text_chunk
                    except:
                        pass

# --- GROQ HELPERS ---

def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def convert_doc_to_images(doc_path):
    """Converts PDF to images. Returns list of image paths."""
    if not PDF_SUPPORT:
        raise Exception("PDF support not available (poppler/pdf2image missing).")
    
    # Needs poppler installed on system
    images = convert_from_path(doc_path)
    img_paths = []
    base = os.path.splitext(doc_path)[0]
    for i, img in enumerate(images):
        path = f"{base}_page_{i}.jpg"
        img.save(path, 'JPEG')
        img_paths.append(path)
        if i >= 4: break # Limit to first 5 pages for API limits
    return img_paths

def stream_groq(prompt, model, file_path=None, mime_type=None):
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    
    messages = []
    content_list = [{"type": "text", "text": prompt}]
    
    if file_path:
        # Check if it's already an image
        if mime_type.startswith("image/"):
            b64_img = encode_image(file_path)
            content_list.append({
                "type": "image_url",
                "image_url": {"url": f"data:{mime_type};base64,{b64_img}"}
            })
        elif mime_type == "application/pdf":
            # Convert PDF to images
            try:
                img_paths = convert_doc_to_images(file_path)
                for path in img_paths:
                    b64 = encode_image(path)
                    content_list.append({
                        "type": "image_url",
                         # Note: Groq mainly supports image/jpeg or png
                        "image_url": {"url": f"data:image/jpeg;base64,{b64}"}
                    })
            except Exception as e:
                yield f"[System Error: PDF Conversion failed - {str(e)}]"
                return
    
    messages.append({"role": "user", "content": content_list})
    
    data = {
        "model": model,
        "messages": messages,
        "stream": True
    }
    
    with requests.post(f"{GROQ_BASE_URL}/chat/completions", headers=headers, json=data, stream=True) as resp:
        for line in resp.iter_lines():
            if line:
                decoded_line = line.decode('utf-8')
                if decoded_line.startswith("data:"):
                    json_str = decoded_line[5:].strip()
                    if json_str == "[DONE]": break
                    try:
                        chunk = json.loads(json_str)
                        content = chunk["choices"][0]["delta"].get("content", "")
                        if content: yield content
                    except:
                        pass


# --- ROUTES ---

@app.route("/")
def home(): return render_template("home.html")

@app.route("/check")
def check(): return render_template("check.html")

@app.route("/extension")
def extension_page(): return render_template("extension.html")

@app.route('/about')
def about_page(): return render_template('about.html')

@app.route('/contact')
def contact_page(): return render_template('contact.html')

@app.route('/guide')
def guide_page(): return render_template('guide.html')

@app.route("/api/models", methods=["GET"])
def get_models():
    """Fetch available models from Gemini and Groq."""
    models = {"gemini": [], "groq": []}
    
    # Fetch Gemini Models
    try:
        url = f"{GEMINI_BASE_URL}/models"
        params = {"key": GEMINI_API_KEY}
        resp = requests.get(url, params=params)
        if resp.status_code == 200:
            data = resp.json()
            for m in data.get("models", []):
                if "generateContent" in m.get("supportedGenerationMethods", []):
                    models["gemini"].append(m["name"].replace("models/", ""))
    except Exception as e:
        print(f"Error fetching Gemini models: {e}", file=sys.stderr)
        models["gemini"] = ["gemini-2.0-flash", "gemini-1.5-flash"]

    # Fetch Groq Models
    try:
        url = f"{GROQ_BASE_URL}/models"
        headers = {"Authorization": f"Bearer {GROQ_API_KEY}"}
        resp = requests.get(url, headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            for m in data.get("data", []):
                models["groq"].append(m["id"])
    except Exception as e:
        print(f"Error fetching Groq models: {e}", file=sys.stderr)
        models["groq"] = ["llama3-8b-8192", "mixtral-8x7b-32768"]
        
    return jsonify(models)


@app.route("/process", methods=["POST"])
def process():
    try:
        user_input = request.form.get("user_input", "").strip()
        provider = request.form.get("provider", "gemini")
        model = request.form.get("model", "")
        web_search = request.form.get("web_search") == "true"
        
        # Files
        file = request.files.get("file")
        file_path = None
        mime_type = None
        
        if file and file.filename:
            filename = secure_filename(file.filename)
            file_path = os.path.join(UPLOAD_FOLDER, filename)
            file.save(file_path)
            mime_type = file.mimetype or "application/octet-stream"
            
            # Simple mime correction for pdf
            if filename.lower().endswith(".pdf"): mime_type = "application/pdf"
            if filename.lower().endswith(".jpg") or filename.lower().endswith(".jpeg"): mime_type = "image/jpeg"
            if filename.lower().endswith(".png"): mime_type = "image/png"

        if not model:
            model = "gemini-2.0-flash" if provider == "gemini" else "llama3-70b-8192"

        # System Prompt construction
        sys_prompt = f"Analyze inputs for facts/misinformation. " \
                     f"Provide Verdict, Reason, and Estimated Truth Probability %."
        
        if user_input:
            prompt = f"{sys_prompt}\n\nUser Input: {user_input}"
        else:
            prompt = f"{sys_prompt}\n\n(Analyze the provided document/image)"

        def generate():
            try:
                if provider == "gemini":
                    # Handle File Upload for Gemini
                    file_uri = None
                    if file_path:
                        yield f"// Uploading {os.path.basename(file_path)} to Google Vault...\n"
                        file_uri = upload_to_gemini(file_path, mime_type)
                        yield f"// Upload Complete. Analysis Started...\n"
                    
                    yield from stream_gemini(prompt, model, file_uri, mime_type, web_search)
                
                else: # Groq
                    if file_path:
                        yield f"// Processing {os.path.basename(file_path)} for Vision Model...\n"
                    yield from stream_groq(prompt, model, file_path, mime_type)
                
            except Exception as e:
                yield f"\n[ERROR: {str(e)}]"
            finally:
                # Cleanup Code if strictly needed, but tmp files might be useful for debug or need cron cleanup
                # if file_path and os.path.exists(file_path): os.remove(file_path)
                pass

        return Response(stream_with_context(generate()), content_type='text/plain')

    except Exception as e:
        print("Flask exception in /process:", e, file=sys.stderr)
        return jsonify({"reply": f"System Error: {e}"}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(debug=True, port=port)
