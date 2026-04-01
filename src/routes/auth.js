const express = require("express");
const authRouter = express.Router();
const { signupDateValidator } = require("../utils/validator");
const User = require("../models/user");
const bcrypt = require("bcrypt");

authRouter.post("/signUp", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      emailId,
      password,
      gender,
      age,
      about,
      photoUrl,
      skills,
    } = req.body;
    signupDateValidator(req);
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      firstName,
      lastName,
      emailId,
      password: hashedPassword,
      gender,
      age,
      about,
      photoUrl,
      skills,
    });

    const userData = await user.save();
    const token = await userData.getJWT();
    const isProduction = process.env.NODE_ENV === "production";

    res.cookie("token", token, {
      httpOnly: true,
      secure: isProduction, // true in prod, false in dev
      sameSite: isProduction ? "none" : "lax", // none in prod, lax in dev
    });

    res.json({ message: "User created successfully!!", data: userData });

    // res.send("User created successfully!!");
  } catch (err) {
    res.status(400).send("Error saving the user: " + err.message);
  }
});

// Login API
authRouter.post("/login", async (req, res) => {
  try {
    const { emailId, password } = req.body;
    if (!emailId) {
      throw new Error("Email Id field can't be blank");
    }

    const userData = await User.findOne({ emailId: emailId });

    if (!userData || userData?.length == 0) {
      throw new Error("Entered data is invalid");
    } else {
      const match = await userData.validatePassword(password);
      if (!match) {
        return res.status(401).send("Invalid credentials");
      }
      const token = await userData.getJWT();
      const isProduction = process.env.NODE_ENV === "production";

      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction, // true in prod, false in dev
        sameSite: isProduction ? "none" : "lax", // none in prod, lax in dev
      });

      res.send(userData);
    }
  } catch (err) {
    res.status(400).send("Error saving the user: " + err.message);
  }
});

authRouter.post("/logout", async (req, res) => {
  res
    .cookie("token", null, { expires: new Date(Date.now()) })
    .send("Logout done!!");
});

module.exports = authRouter;
