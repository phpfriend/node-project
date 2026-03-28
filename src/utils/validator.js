const validator = require("validator");

const signupDateValidator = (req)=> {
    const {firstName, lastName} = req.body;
    if(!firstName || !lastName){
        throw new Error("FirstName or LastName can not be blank");
    }
}

const profileUpdateValidator = (req) => {
    const {firstName, lastName, age, gender} = req.body;
    if(!firstName || !lastName || !gender){
        throw new Error("FirstName or LastName or gender can not be blank");
    }
    if(!validator.isInt(age.toString(), {min:18, max:70})){
        throw new Error("Age should be min 18 and max 70")
    }
}

module.exports = {
    signupDateValidator,
    profileUpdateValidator
}

    