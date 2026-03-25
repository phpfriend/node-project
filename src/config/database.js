
const mongoose = require("mongoose");

const connectDB = async () => {
    await mongoose.connect("mongodb+srv://ytiwari01_db_user:xxxxxxx@namstecluster.qdmx6zg.mongodb.net/devTinder");
};

module.exports = connectDB;


