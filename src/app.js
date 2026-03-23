const express = require("express");

const app = express();

app.use("", (req, res)=>{
    res.send("Message from server");
});

app.listen(7777, ()=>{
    console.log("Server listenning on port 7777");
});