const express = require("express");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

// Contact Form (temporary version without MongoDB)
app.post("/contact", async (req, res) => {
    res.json({
        success: true,
        message: "Message received successfully!"
    });
});

// Contacts Route
app.get("/contacts", async (req, res) => {
    res.json([]);
});

// Home Page Route
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});