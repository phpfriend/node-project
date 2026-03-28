const jwt = require("jsonwebtoken");
const User = require("../models/user");

const userAuth = async(req, res, next) => {
    try {

        const { token } = req.cookies;
        
        if(!token){
            throw new Error("Token is not valid!!!!!!");
        }

        const decodeObj = await jwt.verify(token, "DEV@Tinder$790"); 
        const { _id } = decodeObj;
        const user = await User.findById(_id);
        console.log("User: "+ user);
        if (!user){
            throw new Error("User not found");
        }

        req.user = user;
        next();

    } catch(err) {
        res.status(400).send("Error: "+err);
    }
};

module.exports = {
    userAuth
}; 