import multer from "multer";
import { AppError } from "../errors/AppError";
import { ALLOWED_DOCUMENT_MIME_TYPES } from "../services/documentExtraction.service";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimetype as (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number])) {
      callback(AppError.badRequest("Unsupported file type. Upload a PDF or DOCX file."));
      return;
    }
    callback(null, true);
  },
}).single("file");
