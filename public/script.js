const menuToggle = document.getElementById('menuToggle');
const mobileNav = document.getElementById('mobileNav');
const themeToggle = document.getElementById('themeToggle');
const toTop = document.getElementById('toTop');
const year = document.getElementById('year');
const contactForm = document.getElementById('contactForm');
const statusEl = document.getElementById('status');

year.textContent = new Date().getFullYear();

menuToggle?.addEventListener('click', () => {
  const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!isOpen));
  mobileNav.style.display = isOpen ? 'none' : 'flex';
});

mobileNav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    mobileNav.style.display = 'none';
    menuToggle.setAttribute('aria-expanded', 'false');
  });
});

const savedTheme = localStorage.getItem('portfolio-theme');
if (savedTheme === 'light') {
  document.body.classList.add('light');
  themeToggle?.setAttribute('aria-pressed', 'true');
}

themeToggle?.addEventListener('click', () => {
  const isLight = document.body.classList.toggle('light');
  localStorage.setItem('portfolio-theme', isLight ? 'light' : 'dark');
  themeToggle.setAttribute('aria-pressed', String(isLight));
  themeToggle.textContent = isLight ? '☾' : '☼';
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

window.addEventListener('scroll', () => {
  toTop?.classList.toggle('show', window.scrollY > 700);
}, { passive: true });

toTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

contactForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const message = document.getElementById('message').value.trim();

  if (name.length < 2 || name.length > 80) {
    statusEl.textContent = 'Please enter a valid name.';
    statusEl.className = 'form-status error';
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    statusEl.textContent = 'Please enter a valid email address.';
    statusEl.className = 'form-status error';
    return;
  }

  if (message.length < 10) {
    statusEl.textContent = 'Please add a little more detail to your message.';
    statusEl.className = 'form-status error';
    return;
  }

  const submitButton = contactForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  statusEl.textContent = 'Sending your message…';
  statusEl.className = 'form-status';

  try {
    const response = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, message })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Unable to send your message.');

    statusEl.textContent = data.message || 'Message sent successfully.';
    statusEl.className = 'form-status success';
    contactForm.reset();
  } catch (error) {
    statusEl.textContent = error.message || 'Unable to send your message right now.';
    statusEl.className = 'form-status error';
  } finally {
    submitButton.disabled = false;
  }
});
