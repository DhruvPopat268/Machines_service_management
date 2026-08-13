const express = require("express");
const router  = express.Router();
const multer  = require("multer");
const { getAll, create, update, remove, downloadSample, importIncentives, exportIncentives } = require("./admin.incentive.controller");

const upload = multer({ storage: multer.memoryStorage() });

router.get("/", getAll);
router.post("/", create);
router.patch("/:id", update);
router.delete("/:id", remove);
router.get("/sample", downloadSample);
router.post("/import", upload.single("file"), importIncentives);
router.get("/export", exportIncentives);

module.exports = router;
