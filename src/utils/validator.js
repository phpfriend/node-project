const validator = require("validator");

const signupDateValidator = (req)=> {
    const {firstName, lastName} = req.body;
    if(!firstName || !lastname){
        throw new Error("FirstName or LastName can not be blank");
    }
}

module.exports = signupDateValidator;