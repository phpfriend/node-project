const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const connectDB = require("./config/database");
const User = require("./models/user");
const signupDateValidator = require("./utils/validator");
const { userAuth } = require("./middlewares/auth");

const app = express();
app.use(express.json());
app.use(cookieParser());

app.get("/user", userAuth, async(req, res) => {
    const userEmailId = req.query.emailId;
    try {
        const user = await User.find({emailId: userEmailId});
        res.send(user);
    } catch (err) {
        res.status(400).send("Something went wrong"+err);
    }
    
});

//feed API to get all user listed

app.get("/feed", userAuth, async (req, res) => {
    try {
         const users = await User.find({});
         res.send(users);
    } catch {
        res.status(400).send("Something went wrong!!");
    }
})

// Delete user

app.delete("/user", userAuth, async(req, res) => {
    const userId  = req.body.userId;
    
    try{
         await User.findByIdAndDelete({_id: userId});
        //await User.findByIdAndDelete(userId);
        res.send("User Removed Successfully!!!")
    } catch(err){
        res.status(400).send("Something went wrong"+err);
    }
    
})
// Signup API
app.post("/signUp", async (req, res) => {
  try {
    const { firstName, lastName, emailId, password, gender, age } = req.body;
    signupDateValidator(req);
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      firstName,
      lastName,
      emailId,
      password: hashedPassword,
      gender,
      age
    });

    await user.save();

    res.send("User created successfully!!");

  } catch (err) {
    res.status(400).send("Error saving the user: " + err.message);
  }
});


// Login API
app.post("/login", async (req, res) => {
  try {
    const { emailId, password } = req.body;
    //console.log(emailId);
    if(!emailId){
        throw new Error("Email Id field can't be blank");
    }

    const userData = await User.findOne({ emailId: emailId });
    //console.log(userData);

    if(!userData || userData?.length==0){
         throw new Error("Entered data is invalid");
    } else {
         // const userData = await User.findOne({ emailId: emailId });
         const match = await bcrypt.compare(password, userData.password);

        if (!match) {
            return res.status(401).send("Invalid credentials");
        }

        const token = jwt.sign({ _id: userData._id }, "DEV@Tinder$790");

        res.cookie("token", token, {
            httpOnly: true
        });

        res.send("Login successful");
    }
  } catch (err) {
    res.status(400).send("Error saving the user: " + err.message);
  }
});

//Check Profile

app.get("/profile", userAuth, async(req, res) => {
    try {
        const user = req.user;
        res.send(user);
    } catch {
        res.status(400).send("Error: "+err);
    }
});

//send connection request

app.post("/sendConnectionRequest", userAuth, async(req, res) => {
    const user = req.user;
    res.send(user.firstName+" sent Connection Request!!");
})

connectDB().then(() => {
    console.log("Database connection is established");
    app.listen(7777, ()=>{
    console.log("Server listenning on port 7777");
});
 }).catch((err)=>{
    console.log("Database connection canont be established");
 });


app.use("", (req, res)=>{
    res.send("Message from server");
});

