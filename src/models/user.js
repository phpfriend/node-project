const validator = require("validator");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { Schema } = mongoose;

const userSchema = new Schema(
  {
    firstName: {
      type: String,
      min: 4,
      max: 20,
      required: true,
    },
    lastName: {
      type: String,
      min: 4,
      max: 20,
      required: true,
    },
    password: {
      type: String,
    },
    emailId: {
      type: String,
      validate(email) {
        if (validator.isEmail(email)) {
          return true;
        } else {
          throw new Error("Email is not valid");
        }
      },
    },
    password: {
      type: String,
    },
    age: {
      type: Number,
    },
    gender: {
      type: String,
    },
  },
  {
    timestamp: true,
  },
);

userSchema.methods.getJWT = async function () {
  const user = this;
  const token = await jwt.sign({ _id: user._id }, "DEV@Tinder$790", {
    expiresIn: "7d",
  });
  return token;
};

userSchema.methods.validatePassword = async function (passwordInputByuser) {
  const user = this;
  const passwordHash = user.password;
  const isValidPassword = await bcrypt.compare(
    passwordInputByuser,
    passwordHash,
  );
  return isValidPassword;
};

const User = mongoose.model("User", userSchema);

module.exports = User;
