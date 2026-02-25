/**
 * App — Navigation, Smooth Scroll, Contact Form
 */
(function () {
    const nav = document.getElementById('nav');
    const navToggle = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');
    const contactForm = document.getElementById('contactForm');
    const contactStatus = document.getElementById('contactStatus');
    const contactSubmit = document.getElementById('contactSubmit');

    // =====================
    // Navigation scroll effect
    // =====================
    function onScroll() {
        const scrollY = window.scrollY;

        if (scrollY > 50) {
            nav.classList.add('nav--scrolled');
        } else {
            nav.classList.remove('nav--scrolled');
        }
    }

    window.addEventListener('scroll', onScroll, { passive: true });

    // =====================
    // Mobile nav toggle
    // =====================
    navToggle.addEventListener('click', () => {
        const isOpen = navLinks.classList.toggle('nav__links--open');
        navToggle.classList.toggle('nav__toggle--active');
        document.body.classList.toggle('no-scroll', isOpen);
    });

    // Close mobile nav on link click
    navLinks.querySelectorAll('.nav__link').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('nav__links--open');
            navToggle.classList.remove('nav__toggle--active');
            document.body.classList.remove('no-scroll');
        });
    });

    // =====================
    // Smooth scroll for anchor links
    // =====================
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.querySelector(anchor.getAttribute('href'));
            if (target) {
                const offset = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')) || 64;
                const y = target.getBoundingClientRect().top + window.scrollY - offset;
                window.scrollTo({ top: y, behavior: 'smooth' });
            }
        });
    });

    // =====================
    // Contact form
    // =====================
    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Check if Formspree ID is set
            const action = contactForm.getAttribute('action');
            if (action.includes('YOUR_FORM_ID')) {
                contactStatus.textContent = 'Formularz nie jest jeszcze skonfigurowany.';
                contactStatus.className = 'contact__status contact__status--error';
                return;
            }

            // Disable button
            contactSubmit.disabled = true;
            contactSubmit.querySelector('span').textContent = 'Wysyłanie...';

            try {
                const formData = new FormData(contactForm);
                const res = await fetch(action, {
                    method: 'POST',
                    body: formData,
                    headers: { 'Accept': 'application/json' }
                });

                if (res.ok) {
                    contactStatus.textContent = 'Wiadomość wysłana pomyślnie!';
                    contactStatus.className = 'contact__status contact__status--success';
                    contactForm.reset();
                } else {
                    throw new Error('Failed to send');
                }
            } catch (err) {
                contactStatus.textContent = 'Coś poszło nie tak. Spróbuj ponownie.';
                contactStatus.className = 'contact__status contact__status--error';
            } finally {
                contactSubmit.disabled = false;
                contactSubmit.querySelector('span').textContent = 'Wyślij wiadomość';

                // Clear status after 5s
                setTimeout(() => {
                    contactStatus.textContent = '';
                    contactStatus.className = 'contact__status';
                }, 5000);
            }
        });
    }

    // =====================
    // Reveal on scroll (for sections)
    // =====================
    const sections = document.querySelectorAll('.contact__inner');
    const sectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                sectionObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    sections.forEach(section => {
        section.style.opacity = '0';
        section.style.transform = 'translateY(30px)';
        section.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
        sectionObserver.observe(section);
    });
})();
