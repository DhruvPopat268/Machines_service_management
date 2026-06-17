const axios = require("axios");

const onesignal = axios.create({
  baseURL: "https://onesignal.com/api/v1",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Basic ${process.env.ONESIGNAL_API_KEY}`,
  },
});

const APP_ID = process.env.ONESIGNAL_APP_ID;

module.exports = { onesignal, APP_ID };
