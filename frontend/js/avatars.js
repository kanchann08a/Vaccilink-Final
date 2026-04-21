/**
 * VacciLink Avatar Utility
 * Provides role-based SVG avatars and dynamic styling.
 */

function getAvatar(role, image) {
    if (image && image.trim() !== "") return image;

    const baseIconPath = "/icons/";
    if (role === "baby") return baseIconPath + "baby.svg";
    if (role === "parent") return baseIconPath + "parent.svg";
    // vaccinator is now handled via font-awesome in applyAvatar, so this returns empty if used
    return baseIconPath + "default.svg";
}

/**
 * Injects an SVG avatar into a container or replaces an image source.
 * @param {HTMLElement} element - The target element.
 * @param {string} role - The role (baby, parent, vaccinator).
 * @param {string} [image] - Optional custom image URL.
 */
function applyAvatar(element, role, image) {
    if (!element) return;

    const src = getAvatar(role, image);
    
    // Determine background color based on role
    const backgrounds = {
        baby: "#eff6ff",      // Light blue tint
        parent: "#dbeafe",    // Blue tint
        vaccinator: "#f0fdf4" // Green tint
    };

    const bgColor = backgrounds[role] || "#f1f5f9";

    if (element.tagName === "IMG") {
        element.src = src;
        element.style.backgroundColor = bgColor;
        element.style.borderRadius = "50%";
        element.style.objectFit = "contain";
        element.style.padding = "8px"; // Room for the icon
    } else {
        if (role === "vaccinator") {
            // Guarantee font-awesome is loaded
            if (!document.getElementById("font-awesome-cdn")) {
                const faLink = document.createElement("link");
                faLink.id = "font-awesome-cdn";
                faLink.rel = "stylesheet";
                faLink.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css";
                document.head.appendChild(faLink);
            }
            element.innerHTML = `<i class="fa-solid fa-user-nurse" style="color: #2E7D32; font-size: 1.4rem;"></i>`;
        } else {
            element.innerHTML = `<img src="${src}" style="width:100%; height:100%; object-fit:contain; padding:8px;" />`;
        }
        element.style.backgroundColor = bgColor;
        element.style.borderRadius = "50%";
        element.style.display = "flex";
        element.style.alignItems = "center";
        element.style.justifyContent = "center";
        element.style.overflow = "hidden";
        element.style.transition = "transform 0.2s, box-shadow 0.2s";
        
        // Add hover effects via JS if not in CSS
        element.onmouseenter = () => {
            element.style.transform = "scale(1.05)";
            element.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
        };
        element.onmouseleave = () => {
            element.style.transform = "scale(1)";
            element.style.boxShadow = "none";
        };
    }
}
