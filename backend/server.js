require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const connectDB = require("./database/connection");

const app = express();

connectDB();

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const cloudPath = process.env.NODE_ENV === "production"
  ? "/app/cloud"
  : path.join(__dirname, "cloud");
app.use("/app/cloud", express.static(cloudPath));

app.use("/api", require("./routes/index"));

app.get("/", (req, res) => res.send("Server is running"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));