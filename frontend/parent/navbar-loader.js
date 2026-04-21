document.addEventListener("DOMContentLoaded", function () {
    const navbarContainer = document.getElementById("navbar-container");
    if (!navbarContainer) return;

    fetch("navbar.html")
        .then(res => res.text())
        .then(data => {
            navbarContainer.innerHTML = data;

            // Get current page filename
            const path = window.location.pathname;
            const currentPage = path.split("/").pop();

            // Handle active class
            const navLinks = document.querySelectorAll(".nav-link");
            navLinks.forEach(link => {
                const href = link.getAttribute("href");
                if (href === currentPage) {
                    link.classList.add("active");
                } else if (!currentPage && href === "dashboard.html") {
                    // Default to dashboard if at root parent dir
                    link.classList.add("active");
                }
            });
            // Apply SVG Avatars globally if utility is loaded
            if (typeof applyAvatar === 'function') {
                document.querySelectorAll(".profile-avatar").forEach(el => applyAvatar(el, "parent"));
            } else {
                // Try to load it dynamically
                const script = document.createElement('script');
                script.src = "../js/avatars.js";
                script.onload = () => {
                    document.querySelectorAll(".profile-avatar").forEach(el => applyAvatar(el, "parent"));
                };
                document.head.appendChild(script);
            }
        })
        .catch(err => console.error("Error loading navbar:", err));
});
