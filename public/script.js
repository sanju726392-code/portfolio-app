console.log("script.js loaded");
const contactForm = document.getElementById("contactForm");

const status = document.getElementById("status");


contactForm.addEventListener("submit", async function (event) {

    event.preventDefault();


    const name = document.getElementById("name").value;

    const email = document.getElementById("email").value;

    const message = document.getElementById("message").value;


    try {

        const response = await fetch("/contact", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                name: name,
                email: email,
                message: message
            })

        });


        const data = await response.json();


        if (data.success) {

            status.innerText = "Message sent successfully!";

            contactForm.reset();

        } else {

            status.innerText = "Something went wrong.";

        }

    } catch (error) {

        status.innerText = "Server connection error.";

        console.log(error);

    }

});