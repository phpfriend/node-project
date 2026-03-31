const express = require("express");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/database");
const { userAuth } = require("./middlewares/auth");
const User = require("./models/user");

const app = express();

// ✅ Custom CORS middleware — works perfectly with Express 5
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    return res.status(204).send();
  }

  next();
});

app.use(express.json());
app.use(cookieParser());

const authRouter = require("./routes/auth");
const profileRouter = require("./routes/profile");
const requestRouter = require("./routes/request");
const userRouter = require("./routes/user");

app.use("/", authRouter);
app.use("/", profileRouter);
app.use("/", requestRouter);
app.use("/", userRouter);

// ... rest of your routes

app.use((req, res) => {
  res.status(404).send("Route not found");
});

connectDB()
  .then(() => {
    console.log("Database connection is established");
    app.listen(7777, () => {
      console.log("Server listening on port 7777");
    });
  })
  .catch((err) => {
    console.log("Database connection cannot be established", err);
  });
