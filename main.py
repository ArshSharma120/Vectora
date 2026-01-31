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
    from pdf2image import convert_from_path # type: ignore
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False

load_dotenv()

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app)

# DATA DIRS
# DATA DIRS
# In Vercel (Lambda), only /tmp is writable
UPLOAD_FOLDER = '/tmp/vectora_uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ✅ API Keys
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
CEREBRAS_API_KEY = os.getenv("CEREBRAS_API_KEY")

# Base URLs
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1"


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
        
    payload = {
        "contents": contents,
        "generationConfig": {"temperature": 0.1} 
    }
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
                        cand = chunk.get("candidates", [{}])[0]
                        content = cand.get("content", {}).get("parts", [{}])[0].get("text", "")
                        
                        # Handle Text
                        if content: yield content
                        
                        # Handle Grounding Metadata (Source Links)
                        grounding = cand.get("groundingMetadata", {})
                        chunks = grounding.get("groundingChunks", [])
                        if chunks:
                            links_md = "\n\n**Verified Sources:**\n"
                            found_links = False
                            for c in chunks:
                                web = c.get("web", {})
                                if web:
                                    title = web.get("title", "Source")
                                    uri = web.get("uri") or web.get("url") # Try both keys
                                    if uri and uri.startswith("http"):
                                        links_md += f"- [{title}]({uri})\n"
                                        found_links = True
                                if found_links:
                                    # Yield formatted source block as Markdown
                                    yield "\n\n**Verified Sources:**\n" + links_md
                    except Exception as e:
                        pass

# --- GROQ HELPERS ---

def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def convert_doc_to_images(doc_path):
    """Converts PDF to images. Returns list of image paths."""
    if not PDF_SUPPORT:
        raise Exception("System Configuration Error: 'poppler' is not installed or not in PATH. PDF conversion for non-native models (like Groq) requires Poppler. Please install Poppler or use Gemini (native PDF support).")
    
    try:
        images = convert_from_path(doc_path)
    except Exception as e:
         if "poppler" in str(e).lower() or "not in path" in str(e).lower():
             raise Exception("System Error: Poppler not found. Please install Poppler to process PDFs with this model, or switch to Gemini.")
         raise e

    img_paths = []
    base = os.path.splitext(doc_path)[0]
    for i, img in enumerate(images):
        path = f"{base}_page_{i}.jpg"
        img.save(path, 'JPEG')
        img_paths.append(path)
        if i >= 4: break # Limit to first 5 pages for API limits
    return img_paths

def stream_groq(prompt, model, file_path=None, mime_type=None, web_search=False):
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    
    messages = []
    content_list = [{"type": "text", "text": prompt}]
    
    if file_path and mime_type:
        # Check if model supports vision (managed by frontend selection normally, but backend check is good)
        if mime_type.startswith("image/"):
            b64_img = encode_image(file_path)
            content_list.append({
                "type": "image_url",
                "image_url": {"url": f"data:{mime_type};base64,{b64_img}"}
            })
        elif mime_type == "application/pdf":
            try:
                img_paths = convert_doc_to_images(file_path)
                for path in img_paths:
                    b64 = encode_image(path)
                    content_list.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{b64}"}
                    })
            except Exception as e:
                yield f"[System Error: PDF Conversion failed - {str(e)}]"
                return
    
    messages.append({"role": "user", "content": content_list})
    
    data = {
        "model": model, 
        "messages": messages, 
        "stream": True,
        "temperature": 0.2
    }

    # Enable tools for relevant models if web_search is requested
    if web_search:
        if "gpt-oss" in model:
            # GPT-OSS supports browser_search
            data["tools"] = [{"type": "browser_search"}]
        elif "compound" in model:
            # Compound requires compound_custom to enable tools
            data["compound_custom"] = {"tools": {"enabled_tools": ["web_search", "code_interpreter", "visit_website"]}}

    
    with requests.post(f"{GROQ_BASE_URL}/chat/completions", headers=headers, json=data, stream=True) as resp:
        # Check for immediate API errors
        if resp.status_code != 200:
            try:
                err_blob = resp.json()
                err_msg = err_blob.get('error', {}).get('message', resp.text)
            except:
                err_msg = resp.text
            yield f"\n[API ERROR ({resp.status_code}): {err_msg}]"
            return

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
                else:
                    # Capture non-SSE errors if any appear in stream
                    try:
                        err_chunk = json.loads(decoded_line)
                        if "error" in err_chunk:
                            yield f"\n[Stream Error: {err_chunk['error'].get('message', decoded_line)}]"
                    except:
                        pass

# --- CEREBRAS HELPERS ---

def stream_cerebras(prompt, model):
    headers = {
        "Authorization": f"Bearer {CEREBRAS_API_KEY}",
        "Content-Type": "application/json"
    }
    data = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": True,
        "temperature": 0.2
    }
    
    with requests.post(f"{CEREBRAS_BASE_URL}/chat/completions", headers=headers, json=data, stream=True) as resp:
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

@app.route('/instructions')
def instructions_page(): return render_template('instructions.html')

@app.route('/extension-v2.6.zip')
def download_extension():
    """Serve the extension ZIP file for download"""
    from flask import send_file
    extension_zip_path = os.path.join(os.path.dirname(__file__), 'extension-v2.6.zip')
    if os.path.exists(extension_zip_path):
        return send_file(extension_zip_path, as_attachment=True, download_name='extension-v2.6.zip')
    else:
        return jsonify({"error": "Extension file not found"}), 404


# CURATED MODELS - Final Selection
CURATED_MODELS = {
    "gemini": [
        "gemini-3-flash-preview",
        "gemini-2.5-flash", 
        "gemini-2.5-flash-lite"
    ],
    "groq": [
        "groq/compound",
        "groq/compound-mini", 
        "openai/gpt-oss-120b",
        "meta-llama/llama-4-maverick-17b-128e-instruct",
        "meta-llama/llama-4-scout-17b-16e-instruct"
    ],
    "cerebras": [
        "zai-glm-4.7" 
    ]
}

MODEL_METADATA = {
    # IMAGES
    "meta-llama/llama-4-maverick-17b-128e-instruct": {
        "category": "image", "badge": "DEFAULT", "badge_color": "primary",
        "description": "Best default for image analysis - 128K context", "capabilities": ["text", "image"]
    },
    "meta-llama/llama-4-scout-17b-16e-instruct": {
        "category": "image", "badge": "FAST", "badge_color": "success",
        "description": "Fast image analysis alternative", "capabilities": ["text", "image"]
    },
    
    # GEMINI (Images, Text, PDF)
    "gemini-3-flash-preview": {
        "category": "image,text,pdf", "badge": "PREMIUM", "badge_color": "warning",
        "description": "Latest Gemini - SynthID, PDF support, Web Grounding", "capabilities": ["text", "image", "pdf", "web_search"]
    },
    "gemini-2.5-flash": {
        "category": "image,text,pdf", "badge": "FALLBACK", "badge_color": "tertiary",
        "description": "Gemini fallback - balanced", "capabilities": ["text", "image", "pdf", "web_search"]
    },
    "gemini-2.5-flash-lite": {
        "category": "image,text,pdf", "badge": "LITE", "badge_color": "muted",
        "description": "Faster, lighter Gemini fallback", "capabilities": ["text", "image", "pdf", "web_search"]
    },
    
    # TEXT
    "groq/compound": {
        "category": "text", "badge": "DEFAULT", "badge_color": "primary",
        "description": "Fact-checking with multiple web searches", "capabilities": ["text", "web_search"]
    },
    "groq/compound-mini": {
        "category": "text", "badge": "FAST", "badge_color": "success",
        "description": "Faster single web search", "capabilities": ["text", "web_search"]
    },
    "openai/gpt-oss-120b": {
        "category": "text", "badge": "LONG DOCS", "badge_color": "tertiary",
        "description": "131K context with web search", "capabilities": ["text", "web_search"]
    },
    "zai-glm-4.7": {
        "category": "text", "badge": "REASONING", "badge_color": "secondary",
        "description": "Complex reasoning - No Web Search", "capabilities": ["text"]
    }
}

@app.route("/api/models", methods=["GET"])
def get_models():
    """Fetch available models with curated metadata."""
    models = {"gemini": [], "groq": [], "cerebras": []}
    
    # 1. Gemini
    for mid in CURATED_MODELS["gemini"]:
        meta = MODEL_METADATA.get(mid, {})
        models["gemini"].append({
            "id": mid,
            "name": mid.upper() if "preview" not in mid else "GEMINI 3 FLASH", 
            **meta
        })

    # 2. Groq
    for mid in CURATED_MODELS["groq"]:
        meta = MODEL_METADATA.get(mid, {})
        # Friendly Name Logic
        name = mid.split('/')[-1].upper()
        if "compound" in mid: name = "GROQ COMPOUND" if "mini" not in mid else "GROQ MINI"
        elif "llama" in mid: name = "LLAMA 4 MAVERICK" if "maverick" in mid else "LLAMA 4 SCOUT"
        elif "gpt" in mid: name = "GPT-OSS 120B"
        
        models["groq"].append({
            "id": mid,
            "name": name,
            **meta
        })

    # 3. Cerebras
    for mid in CURATED_MODELS["cerebras"]:
        meta = MODEL_METADATA.get(mid, {})
        models["cerebras"].append({
            "id": mid,
            "name": "ZAI GLM 4.7", # Updated name
            **meta
        })
    
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
            if filename.lower().endswith(".pdf"): mime_type = "application/pdf"
            if filename.lower().endswith(".jpg") or filename.lower().endswith(".jpeg"): mime_type = "image/jpeg"
            if filename.lower().endswith(".png"): mime_type = "image/png"

        if not model:
            if provider == "gemini": model = "gemini-2.0-flash"
            elif provider == "groq": model = "llama3-70b-8192"
            else: model = "llama3.1-70b"

        # DETAILED SYSTEM PROMPT (Compact Mode V3)
        sys_prompt = (
            "You are Vectora, an elite All-Rounder AI Intelligence Analyst. \n"
            "Your mandate is to provide accurate, deep, and verifiable answers across Fact-Checking, Deep Research, and Technical Analysis.\n\n"
            "## 1. THE \"SEARCH-FIRST\" DOCTRINE (MANDATORY)\n"
            "- **ALWAYS SEARCH**: Use the `Web Search` tool immediately. Do not rely on internal memory.\n"
            "- **IGNORE MEMORY**: Verify everything live against current search data.\n\n"
            "## 2. THE CITATION PROTOCOL (CRITICAL)\n"
            "- **RAW URLS ONLY**: You must extract the `source_url` from the search tool's JSON output.\n"
            "- **NO MASKING**: Never use `[Link](url)`. Always use `[Source Name](https://full.url...)`.\n"
            "- **ERROR CHECK**: If no URL is found, explicitly state \"No live source found.\"\n\n"
            "## 3. RESPONSE ARCHITECTURE (Compact Mode)\n"
            "To avoid data overflow errors, you must use this exact structure:\n\n"
            "### PHASE 1: INTELLIGENCE SUMMARY (BLUF)\n"
            "- Provide a single, high-impact paragraph summarizing the direct answer.\n"
            "- Get straight to the point. Zero filler.\n\n"
            "### PHASE 2: DEEP ANALYSIS (Bullet Points Required)\n"
            "- **Constraint**: Use bullet points for this section to maximize information density and reduce token count.\n"
            "- **Detail**: Cite specific numbers, dates, and technical specs.\n"
            "- **Evidence**: Every claim must map to a search result.\n\n"
            "### PHASE 3: VERIFICATION BLOCK (Mandatory)\n"
            "(End every response with this exact block)\n"
            "---\n"
            "**VERDICT**: [VERIFIED / DEBUNKED / COMPLEX / UNVERIFIED]\n"
            "**CONFIDENCE**: [0-100%]\n"
            "**PRIMARY SOURCES**:\n"
            "1. [Source Name](https://exact-url-from-tool)\n"
            "2. [Source Name](https://exact-url-from-tool)\n"
            "---\n\n"
            "## 4. TONE & STYLE\n"
            "- **Objective**: Cold, precise, and analytical. \n"
            "- **Formatting**: Use Bolding for key entities. \n"
            "- **Brevity**: Do not waste tokens. If a fact can be stated in 5 words, do not use 10."
        )
        
        if user_input:
            prompt = f"{sys_prompt}\n\n[USER INPUT]: {user_input}"
        else:
            prompt = f"{sys_prompt}\n\n(No text input. Analyze the attached file)"

        def generate():
            try:
                if provider == "gemini":
                    file_uri = None
                    if file_path:
                        yield f"// Uploading {os.path.basename(file_path)} to Google Vault...\n"
                        file_uri = upload_to_gemini(file_path, mime_type)
                    
                    yield from stream_gemini(prompt, model, file_uri, mime_type, web_search)
                
                elif provider == "groq":
                    if file_path and mime_type == "application/pdf":
                         yield "[SYSTEM ERROR: Documents/PDFs are restricted to GEMINI models only. Please switch model.]"
                         return
                    if file_path:
                        yield f"// Processing Image Data for Groq...\n"
                    yield from stream_groq(prompt, model, file_path, mime_type, web_search)
                    
                elif provider == "cerebras":
                    # Cerebras is Text-Only currently for standard inference
                    if file_path:
                        yield f"// WARNING: Cerebras provider supports TEXT ONLY. File ignored.\n"
                    yield from stream_cerebras(prompt, model)
                
            except Exception as e:
                yield f"\n[SYSTEM ERROR: {str(e)}]"
            finally:
                pass

        return Response(stream_with_context(generate()), content_type='text/plain')

    except Exception as e:
        print("Flask exception in /process:", e, file=sys.stderr)
        return jsonify({"reply": f"System Error: {e}"}), 500


@app.route('/ai-check', methods=['POST'])
def ai_check():
    """
    Endpoint for the extension to check AI authenticity.
    Accepts: { "text": "...", "image_url": "...", "video_url": "..." }
    Returns: { "ai_percent": 0-100, "message": "..." }
    Uses Cerebras API (OpenAI-compatible) for analysis.
    """
    try:
        data = request.get_json() or {}
        text_content = data.get('text', '').strip()
        image_url = data.get('image_url', '').strip()
        video_url = data.get('video_url', '').strip()
        
        if not (text_content or image_url or video_url):
            return jsonify({"ai_percent": 0, "message": "No content provided"}), 400
        
        if not CEREBRAS_API_KEY:
            return jsonify({"ai_percent": 50, "message": "Cerebras API not configured"}), 500
        
        # Build specific prompt for AI detection
        if text_content:
            system_msg = "You are an AI detection expert. Analyze content and respond with JSON only."
            user_msg = f"""Analyze this text and determine the likelihood it was generated by AI.

Text to analyze:
{text_content}

Respond with a JSON object ONLY (no markdown, no extra text):
{{"ai_percent": <0-100>, "reason": "<brief explanation>"}}

Consider: writing style, unusual patterns, perfect grammar, repetitive phrases, lack of human emotion/opinions, generic content.
Return a percentage 0-100 where:
- 0-20%: Clearly human written
- 21-40%: Likely human with possible AI assistance
- 41-60%: Mixed or unclear
- 61-80%: Likely AI-generated
- 81-100%: Almost certainly AI-generated"""
            
            messages = [{"role": "user", "content": user_msg}]
            
        else:
            # For images: download, base64-encode, and send as vision request
            system_msg = "You are an AI detection expert. Analyze images and respond with JSON only."
            base_msg = """Analyze this image and determine the likelihood it was AI-generated.

Respond with a JSON object ONLY (no markdown, no extra text):
{"ai_percent": <0-100>, "reason": "<brief explanation>"}

Consider: artifacts, unnatural patterns, weird textures, impossible physics, watermarks, tool signs.
Return 0-100 where 0=clearly real, 100=certainly AI-generated."""
            
            image_data = None
            mime_type = "image/jpeg"
            try:
                # Download image from URL
                img_resp = requests.get(image_url or video_url, timeout=10)
                if img_resp.status_code == 200:
                    image_data = base64.b64encode(img_resp.content).decode('utf-8')
                    # Guess mime type from content-type header
                    content_type = img_resp.headers.get('content-type', 'image/jpeg')
                    if 'png' in content_type.lower():
                        mime_type = "image/png"
                    elif 'gif' in content_type.lower():
                        mime_type = "image/gif"
                    elif 'webp' in content_type.lower():
                        mime_type = "image/webp"
            except Exception as e:
                print(f"Failed to download image: {e}", file=sys.stderr)
            
            if image_data:
                messages = [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": base_msg},
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:{mime_type};base64,{image_data}"}
                            }
                        ]
                    }
                ]
            else:
                # Fallback if image download fails
                messages = [
                    {
                        "role": "user",
                        "content": base_msg + f"\n\nNote: Could not download image from {image_url or video_url}"
                    }
                ]
        
        # Call Cerebras API (OpenAI-compatible)
        url = "https://api.cerebras.ai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {CEREBRAS_API_KEY}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": "llama-3-70b-instruct",  # Cerebras model
            "messages": messages,
            "temperature": 0.3,
            "max_tokens": 256
        }
        
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=15)
            
            if resp.status_code != 200:
                print(f"Cerebras API error: {resp.status_code} - {resp.text}", file=sys.stderr)
                return jsonify({"ai_percent": 50, "message": "Analysis service temporarily unavailable"}), 200
            
            result = resp.json()
            text_response = result.get("choices", [{}])[0].get("message", {}).get("content", "")
            
            if not text_response:
                return jsonify({"ai_percent": 50, "message": "No analysis returned"}), 200
            
            # Clean up markdown code blocks if present
            text_response = text_response.replace("```json", "").replace("```", "").strip()
            
            # Extract JSON from response
            try:
                import re
                json_match = re.search(r'\{.*?\}', text_response, re.DOTALL)
                if json_match:
                    json_str = json_match.group()
                    analysis = json.loads(json_str)
                    ai_percent = int(analysis.get("ai_percent", 50))
                    reason = analysis.get("reason", "Analysis complete")
                else:
                    # Try direct parse if it's pure JSON
                    analysis = json.loads(text_response)
                    ai_percent = int(analysis.get("ai_percent", 50))
                    reason = analysis.get("reason", "Analysis complete")
            except json.JSONDecodeError as je:
                # Fallback: extract percentage and reason from text
                percent_match = re.search(r'"ai_percent"\s*:\s*(\d+)', text_response)
                ai_percent = int(percent_match.group(1)) if percent_match else 50
                reason_match = re.search(r'"reason"\s*:\s*"([^"]*)"', text_response)
                reason = reason_match.group(1) if reason_match else "Unable to parse full response"
            
            # Ensure percentage is valid
            ai_percent = min(100, max(0, ai_percent))
            
            return jsonify({
                "ai_percent": ai_percent,
                "message": reason
            }), 200
        
        except requests.exceptions.Timeout:
            return jsonify({"ai_percent": 50, "message": "Analysis timeout"}), 200
        except Exception as api_error:
            print(f"API call error: {str(api_error)}", file=sys.stderr)
            return jsonify({"ai_percent": 50, "message": "Analysis service error"}), 200
    
    except Exception as e:
        print(f"AI check error: {str(e)}", file=sys.stderr)
        return jsonify({"ai_percent": 50, "message": f"Error: {str(e)[:50]}"}), 200


# Extension API endpoint - Return API keys for extension use
@app.route("/api/extension/keys", methods=["GET"])
def get_extension_keys():
    """Return API keys for Chrome extension (so users don't need to manually enter)"""
    return jsonify({
        "gemini_api_key": GEMINI_API_KEY,
        "groq_api_key": GROQ_API_KEY,
        "cerebras_api_key": CEREBRAS_API_KEY
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(debug=True, port=port)
