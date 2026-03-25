const validator = require("validator");
const mongoose = require("mongoose");
const { Schema } = mongoose;

const userSchema = new Schema({
    firstName: { 
        type: String,
        min: 4,
        max: 20
    },
    lastName: {
        type: String,
        min: 4,
        max: 20
    },
    password: {
       type: String
    },
    emailId: {
        type: String,
        validate(email){
            if(validator.isEmail(email)){
                return true;
            } else {
                throw new Error("Email is not valid");
            }
        }
    },
    password: {
        type: String
    },
    age: {
        type: Number
    },
    gender: {
        type: String
    }
},
    {
        timestamp: true
    }
)

const User = mongoose.model("User", userSchema);

module.exports = User;