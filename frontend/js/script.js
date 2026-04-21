/*
   VacciLink Client Script
   Provides simple interactivity for frontend views.
*/

document.addEventListener("DOMContentLoaded", () => {
    console.log("VacciLink App Initialized.");

    // Select all forms to prevent default submission for demonstration purposes.
    const forms = document.querySelectorAll("form");
    
    forms.forEach(form => {
        form.addEventListener("submit", (e) => {
            // Prevent actual form submission which would reload the page
            e.preventDefault();
            
            // Log to console for students to understand event handling
            console.log("Form submitted!");
            
            // Check if this is a login form by checking for an id or action
            const actionUrl = form.getAttribute('action');
            if (actionUrl) {
                // Redirect user to the page specified in the form action
                window.location.href = actionUrl;
            } else {
                alert("Action completed successfully! (Demo)");
            }
        });
    });

    // Handle generic button clicks with alerts if they don't have a specific link
    const buttons = document.querySelectorAll("button:not([type='submit'])");
    
    buttons.forEach(btn => {
        btn.addEventListener("click", function() {
            // Only alert if it's not a navigation button (managed by onclick attribute in HTML)
            if(!this.parentElement.getAttribute('onclick') && !this.getAttribute('onclick') && !this.classList.contains('faq-question')) {
                // Students can easily change this to actual functionality later
                console.log("Button clicked!");
            }
        });
    });

    // FAQ Accordion Logic
    const faqQuestions = document.querySelectorAll(".faq-question");
    
    faqQuestions.forEach(question => {
        question.addEventListener("click", function() {
            // Toggle active class on the button
            this.classList.toggle("active");
            
            // Toggle the max-height of the answer panel
            const answer = this.nextElementSibling;
            if (answer.style.maxHeight) {
                answer.style.maxHeight = null; // Collapse
            } else {
                answer.style.maxHeight = answer.scrollHeight + "px"; // Expand based on content height
            }
        });
    });

    // Parent Auth - Tab Switching Logic
    window.switchAuthTab = function(tab) {
        // Update Tabs
        document.getElementById('tab-login').classList.remove('active');
        document.getElementById('tab-signup').classList.remove('active');
        document.getElementById('tab-' + tab).classList.add('active');

        // Update Forms
        document.getElementById('form-login').style.display = 'none';
        document.getElementById('form-signup').style.display = 'none';
        
        // Show active form
        const activeForm = document.getElementById('form-' + tab);
        activeForm.style.display = 'block';

        // Resize card for Signup
        const authCard = document.querySelector('.auth-card');
        if (tab === 'signup') {
            authCard.classList.add('signup-active');
        } else {
            authCard.classList.remove('signup-active');
        }
        
        // Minor animation effect for smooth transition
        activeForm.style.opacity = 0;
        setTimeout(() => activeForm.style.opacity = 1, 50);
    };

    // Generic OTP Simulation Function
    function setupOtpFlow(sendBtnId, inputId, submitBtnId, validationFields) {
        const sendBtn = document.getElementById(sendBtnId);
        const otpInput = document.getElementById(inputId);
        const submitBtn = document.getElementById(submitBtnId);

        if (sendBtn) {
            sendBtn.addEventListener("click", () => {
                // Check if prerequisites are filled
                let allFilled = true;
                validationFields.forEach(id => {
                    const el = document.getElementById(id);
                    if (el && el.value.trim() === "") allFilled = false;
                });

                if (!allFilled) {
                    alert("Please fill in the required fields first.");
                    return;
                }
                
                // Simulate sending OTP
                sendBtn.textContent = "Sending...";
                sendBtn.disabled = true;

                setTimeout(() => {
                    sendBtn.textContent = "OTP Sent!";
                    otpInput.disabled = false;
                    otpInput.focus();
                    
                    // Allow submit button to be active if OTP is entered
                    otpInput.addEventListener("input", () => {
                        if (otpInput.value.trim().length >= 4) { // Basic length check for simulation
                            submitBtn.disabled = false;
                        } else {
                            submitBtn.disabled = true;
                        }
                    });

                }, 1000); // Simulate 1 second network delay
            });
        }
    }

    // Setup OTP flows for Login
    setupOtpFlow("sendLoginOtpBtn", "loginOtp", "loginSubmitBtn", ["loginChildId", "loginMobile"]);
    // Setup OTP flow for Vaccinator Login
    setupOtpFlow("sendVaccLoginOtpBtn", "vaccLoginOtp", "vaccLoginSubmitBtn", ["vaccLoginId", "vaccLoginMobile"]);

    // --- PARENT AUTH V2 SPLIT UI ---
    window.switchSplitTab = function(tab) {
        // Update Tabs
        const tabLogin = document.getElementById('split-tab-login');
        const tabSignup = document.getElementById('split-tab-signup');
        if (tabLogin) tabLogin.classList.remove('active');
        if (tabSignup) tabSignup.classList.remove('active');
        
        const activeTab = document.getElementById('split-tab-' + tab);
        if (activeTab) activeTab.classList.add('active');

        // Update Forms
        const formLogin = document.getElementById('split-form-login');
        const formSignup = document.getElementById('split-form-signup');
        if (formLogin) formLogin.style.display = 'none';
        if (formSignup) formSignup.style.display = 'none';
        
        // Show active form
        const activeForm = document.getElementById('split-form-' + tab);
        if (activeForm) activeForm.style.display = 'block';
    };

    // --- PARENT & VACCINATOR UI LOGIC ---
    window.togglePasswordVisibility = function(inputId) {
        const input = document.getElementById(inputId);
        if (input) {
            if (input.type === "password") {
                input.type = "text";
            } else {
                input.type = "password";
            }
        }
    };

});

// A simple function to simulate logout that can be called from HTML onclick
function logout() {
    alert("Logging out...");
    window.location.href = "../index.html"; // Go back to root
}
