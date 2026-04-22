const router = require("express").Router();
const multer = require("multer");
const { getAll, create, update, remove, downloadSample, importAttributes, exportAttributes } = require("./admin.attribute.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(adminAuthMiddleware);

router.get("/sample", downloadSample);
router.get("/export", exportAttributes);
router.post("/import", upload.single("file"), importAttributes);
router.get("/", getAll);
router.post("/", create);
router.patch("/:id", update);
router.delete("/:id", remove);

module.exports = router;
