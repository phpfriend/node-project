const bcrypt = require("bcrypt");
const express = require("express");
const profileRouter = express.Router();
const { userAuth } = require("../middlewares/auth");
const { profileUpdateValidator } = require("../utils/validator");

profileRouter.get("/profile/view", userAuth, async(req, res) => {
    try {
        const user = req.user;
        res.send(user);
    } catch {
        res.status(400).send("Error: "+err);
    }
});

profileRouter.patch("/profile/edit", userAuth, async (req, res) => {
    try {

        profileUpdateValidator(req);

        const user = req.user;

        const allowedFieldToEdit = ['firstName', 'lastName', 'age', 'gender'];

        allowedFieldToEdit.forEach(field => {
            if (req.body[field] !== undefined) {
                user[field] = req.body[field];
            }
        });

        await user.save();

        res.send({
            message: "Profile updated successfully",
            data: user
        });

    } catch (err) {
        res.status(400).send("Error in updating profile " + err.message);
    }
});


profileRouter.patch("/profile/password", userAuth, async(req, res) =>{
    try {
        const { oldPassword, newPassword } = req.body;

         if (!oldPassword || !newPassword) {
            throw new Error("Both old and new passwords are required");
        }

        const userData = req.user;
        const match = await userData.validatePassword(oldPassword);
        if (!match) {
            return res.status(401).send("Invalid password");
        }
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        userData.password = hashedPassword;
        await userData.save();
        res.send("Password updated successfully!!");
    } catch(err){
        res.status(400).send("Error: "+err)
    }
    
});

module.exports = profileRouter;
