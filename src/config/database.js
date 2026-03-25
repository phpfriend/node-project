
const mongoose = require("mongoose");

const connectDB = async () => {
    await mongoose.connect("mongodb+srv://ytiwari01_db_user:riJDXUaQbZmbE97z@namstecluster.qdmx6zg.mongodb.net/devTinder");
};

module.exports = connectDB;


