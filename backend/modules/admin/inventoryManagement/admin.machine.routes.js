const router = require("express").Router();
const multer = require("multer");
const { getAll, getOne, create, update, remove, downloadSample, importMachines, exportMachines } = require("./admin.machine.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");
const { MAX_IMAGES, ALLOWED_EXTENSIONS } = require("./admin.machine.validator");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split(".").pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext))
      return cb(new Error(`Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`));
    cb(null, true);
  },
});

const uploadXlsx = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});


router.get("/sample",  downloadSample);
router.get("/export",  exportMachines);
router.post("/import", uploadXlsx.single("file"), importMachines);
router.get("/",     getAll);
router.get("/:id",  getOne);
router.post("/",    upload.array("images", MAX_IMAGES), create);
router.patch("/:id", upload.array("images", MAX_IMAGES), update);
router.delete("/:id", remove);

module.exports = router;
