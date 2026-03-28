const express = require("express");
const { userAuth } = require("../middlewares/auth");
const ConnectionRequest = require("../models/connectionRequest");
const User = require("./models/user");

const userRouter = express.Router();

userRouter.get("/user/requests/received", userAuth, async (req, res) => {
  try {
    const loggedInUser = req.user;

    const connectionRequests = await ConnectionRequest.find({
      toUserId: loggedInUser._id,
      status: "interested",
    }).populate("fromUserId", ["firstName", "lastName"]);
    res.json({
      message: "Data fetched sucessfully!!!",
      data: connectionRequests,
    });
  } catch (err) {
    res.status(400).send("Error" + err.message);
  }
});

userRouter.get("/user/connections", userAuth, async (req, res) => {
  try {
    const loggedInUser = req.user;
    const connectionRequests = await ConnectionRequest.find({
      $or: [
        { toUserId: loggedInUser._id, status: "accepted" },
        { fromUserid: loggedInUser._id, status: "accpted" },
      ],
    })
      .populate("fromUserId", ["firstName", "lastName"])
      .populate("toUserId", ["firstName", "lastName"]);

    const data = connectionRequests.map((row) => {
      if (row.fromUserId.toString() === loggedInUser._id.toString()) {
        return row.toUserId;
      }
      return row.fromUserId;
    });

    res.json({ data });
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

userRouter.get("/feed", userAuth, async (req, res) => {
  try {
    const loggedInUser = req.user;

    const page = pasrseInt(req.query.page) || 1;
    let limit = parseInt(req.query.page) || 10;
    limit = limit > 50 ? 50 : limit;

    const skip = (page - 1) * limit;

    const connectionRequests = await ConectionRequest({
      $or: [{ fromUserId: loggedInUser._id }, { toUserId: loggedInUser._id }],
    })
      .select("fromUserId", "toUserId", "age", "gender")
      .skip(skip)
      .limit(limit);

    const hideUserFromFeed = new Set();
    connectionRequests.forEach((req) => {
      hideUserFromFeed.add(req.fromUserId.toString());
      hideUserFromFeed.add(req.toUserId.toString());
    });

    const users = await User.find({
      $and: [
        { _id: { $nin: Array.from(hideUserFromFeed) } },
        { _id: { $ne: loggedInUser._id } },
      ],
    }).select("fromUserId", "toUserId");
    res.json({ data: users });
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

module.exports = userRouter;
