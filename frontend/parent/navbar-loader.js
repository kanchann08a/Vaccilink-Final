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

            // Initialize chatbot if present
            setTimeout(() => {
                if (typeof initChatbot === "function") {
                    initChatbot();
                }
            }, 100);
        })
        .catch(err => console.error("Error loading navbar:", err));
});

// AI Chatbot Logic
function initChatbot() {
    const API_BASE = "https://vaccilink-final.onrender.com";
    const parentEmail = localStorage.getItem("parentEmail");

    const fab = document.getElementById("chatbotFab");
    const win = document.getElementById("chatbotWindow");
    const closeBtn = document.getElementById("chatbotClose");
    const messagesEl = document.getElementById("chatbotMessages");
    const inputEl = document.getElementById("chatbotInput");
    const sendBtn = document.getElementById("chatbotSend");
    const quickActions = document.getElementById("chatbotQuickActions");

    if (!fab || !win) return; // Chatbot UI not present

    let isOpen = false;
    let isLoading = false;
    let hasShownWelcome = false;

    // Toggle chat window
    function toggleChat() {
        isOpen = !isOpen;
        win.classList.toggle("open", isOpen);
        fab.classList.toggle("active", isOpen);

        if (isOpen && !hasShownWelcome) {
            hasShownWelcome = true;
            addBotMessage("Hello! 👋 I'm **VacciLink AI**. I can help you with your child's vaccination records and general vaccination information.\n\nTry asking me:\n• What vaccines are pending for my child?\n• When is my child's next vaccination?\n• What is the MMR vaccine?", null);
        }

        if (isOpen) {
            setTimeout(() => inputEl.focus(), 350);
        }
    }

    fab.addEventListener("click", toggleChat);
    closeBtn.addEventListener("click", toggleChat);

    // Format message text (basic markdown bold + newlines)
    function formatMessage(text) {
        return text
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
    }

    // Add a bot message
    function addBotMessage(text, source) {
        const div = document.createElement("div");
        div.className = "chat-msg bot";
        let sourceHTML = '';
        if (source === 'database') {
            sourceHTML = '<span class="msg-source database">📊 From Records</span>';
        } else if (source === 'ai') {
            sourceHTML = '<span class="msg-source ai">🤖 AI Response</span>';
        }
        div.innerHTML = `
            <div class="msg-icon">🤖</div>
            <div class="msg-bubble">${formatMessage(text)}${sourceHTML}</div>
        `;
        messagesEl.appendChild(div);
        scrollToBottom();
    }

    // Add a user message
    function addUserMessage(text) {
        const div = document.createElement("div");
        div.className = "chat-msg user";
        div.innerHTML = `
            <div class="msg-icon">👤</div>
            <div class="msg-bubble">${formatMessage(text)}</div>
        `;
        messagesEl.appendChild(div);
        scrollToBottom();
    }

    // Typing indicator
    function showTyping() {
        const div = document.createElement("div");
        div.className = "typing-indicator";
        div.id = "typingIndicator";
        div.innerHTML = `
            <div class="msg-icon">🤖</div>
            <div class="typing-dots"><span></span><span></span><span></span></div>
        `;
        messagesEl.appendChild(div);
        scrollToBottom();
    }

    function hideTyping() {
        const el = document.getElementById("typingIndicator");
        if (el) el.remove();
    }

    function scrollToBottom() {
        setTimeout(() => {
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }, 50);
    }

    // Send message
    async function sendMessage(text) {
        if (!text.trim() || isLoading) return;

        addUserMessage(text);
        inputEl.value = "";
        isLoading = true;
        sendBtn.disabled = true;
        showTyping();

        try {
            const response = await fetch(API_BASE + "/api/chatbot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: text, email: parentEmail })
            });

            const data = await response.json();
            hideTyping();

            if (data.reply) {
                addBotMessage(data.reply, data.source || null);
            } else {
                addBotMessage("Sorry, I couldn't process that. Please try again.", null);
            }
        } catch (err) {
            hideTyping();
            addBotMessage("I'm having trouble connecting right now. Please check your internet connection and try again.", null);
            console.error("Chatbot error:", err);
        }

        isLoading = false;
        sendBtn.disabled = false;
        inputEl.focus();
    }

    // Event listeners
    sendBtn.addEventListener("click", () => sendMessage(inputEl.value));

    inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage(inputEl.value);
        }
    });

    // Quick action buttons
    quickActions.addEventListener("click", (e) => {
        const btn = e.target.closest(".quick-btn");
        if (btn) {
            sendMessage(btn.dataset.msg);
        }
    });
}
