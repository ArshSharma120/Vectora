// VECTORA - Mobile Menu Handler
// Ensures hamburger menu works on all pages

document.addEventListener('DOMContentLoaded', function () {

    // Create mobile toggle button if it doesn't exist
    const nav = document.querySelector('nav');
    if (!nav) return;

    let mobileToggle = document.querySelector('.mobile-toggle');

    // If mobile toggle doesn't exist, create it
    if (!mobileToggle) {
        mobileToggle = document.createElement('div');
        mobileToggle.className = 'mobile-toggle';
        mobileToggle.innerHTML = `
      <div class="bar"></div>
      <div class="bar"></div>
      <div class="bar"></div>
    `;

        // Insert after logo/brand
        const logo = nav.querySelector('.nav-logo, .nav-brand');
        if (logo && logo.nextSibling) {
            nav.insertBefore(mobileToggle, logo.nextSibling);
        } else {
            nav.appendChild(mobileToggle);
        }
    }

    // Get menu
    const navMenu = document.querySelector('.nav-menu, .nav-links');
    if (!navMenu) return;

    // Toggle menu
    mobileToggle.addEventListener('click', function () {
        this.classList.toggle('active');
        navMenu.classList.toggle('active');

        // Prevent body scroll when menu is open
        if (navMenu.classList.contains('active')) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    });

    // Close menu when clicking outside
    document.addEventListener('click', function (e) {
        if (!nav.contains(e.target) && navMenu.classList.contains('active')) {
            mobileToggle.classList.remove('active');
            navMenu.classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    // Close menu when clicking a nav link
    const navLinks = navMenu.querySelectorAll('a');
    navLinks.forEach(link => {
        link.addEventListener('click', function () {
            if (window.innerWidth <= 768) {
                mobileToggle.classList.remove('active');
                navMenu.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });

    // Handle window resize
    window.addEventListener('resize', function () {
        if (window.innerWidth > 768) {
            mobileToggle.classList.remove('active');
            navMenu.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
});

// Function for existing toggleMenu() calls
function toggleMenu() {
    const mobileToggle = document.querySelector('.mobile-toggle');
    const navMenu = document.querySelector('.nav-menu, .nav-links');

    if (mobileToggle && navMenu) {
        mobileToggle.classList.toggle('active');
        navMenu.classList.toggle('active');

        if (navMenu.classList.contains('active')) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    }
}
