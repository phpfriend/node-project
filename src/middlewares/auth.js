const jwt = require("jsonwebtoken");
const User = require("../models/user");

const userAuth = async (req, res, next) => {
  try {
    const { token } = req.cookies;

    if (!token) {
      return res.status(401).send("Please login!");
    }

    const decodeObj = await jwt.verify(token, process.env.SECRET_JWT_TOKEN);
    const { _id } = decodeObj;
    const user = await User.findById(_id);
    // console.log("User: " + user);
    if (!user) {
      throw new Error("User not found");
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(400).send("Error: " + err);
  }
};

module.exports = {
  userAuth,
};
