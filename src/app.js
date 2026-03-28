const express = require("express");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/database");
const { userAuth } = require("./middlewares/auth");

const app = express();
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

app.get("/user", userAuth, async (req, res) => {
  const userEmailId = req.query.emailId;
  try {
    const user = await User.find({ emailId: userEmailId });
    res.send(user);
  } catch (err) {
    res.status(400).send("Something went wrong" + err);
  }
});

app.get("/feed", userAuth, async (req, res) => {
  try {
    const users = await User.find({});
    res.send(users);
  } catch {
    res.status(400).send("Something went wrong!!");
  }
});

app.delete("/user", userAuth, async (req, res) => {
  const userId = req.body.userId;

  try {
    await User.findByIdAndDelete({ _id: userId });
    //await User.findByIdAndDelete(userId);
    res.send("User Removed Successfully!!!");
  } catch (err) {
    res.status(400).send("Something went wrong" + err);
  }
});

connectDB()
  .then(() => {
    console.log("Database connection is established");
    app.listen(7777, () => {
      console.log("Server listenning on port 7777");
    });
  })
  .catch((err) => {
    console.log("Database connection canont be established");
  });

app.use("", (req, res) => {
  res.send("Message from server");
});
