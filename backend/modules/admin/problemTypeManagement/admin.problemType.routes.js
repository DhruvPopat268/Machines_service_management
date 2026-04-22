const router = require("express").Router();
const multer = require("multer");
const { getAll, create, update, remove, downloadSample, importProblemTypes, exportProblemTypes } = require("./admin.problemType.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(adminAuthMiddleware);

router.get("/sample", downloadSample);
router.get("/export", exportProblemTypes);
router.post("/import", upload.single("file"), importProblemTypes);
router.get("/", getAll);
router.post("/", create);
router.patch("/:id", update);
router.delete("/:id", remove);

module.exports = router;
