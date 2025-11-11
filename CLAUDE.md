# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a tire training tool web application for managing SAM2 image segmentation workflows to create datasets for tire analysis. The application provides:
- React + Vite frontend for uploading single images or entire folders
- Local state management with preview, progress tracking, and interactive SAM2 editor
- Node/Express backend API that handles uploads and returns SAM2 segmentation results

## Development Commands

### Core Development
- `npm run dev` - Start both client (port 5173) and server (port 4000) in parallel with auto-proxy for `/api`
- `npm run dev:client` - Start only the React UI
- `npm run dev:server` - Start only the API server in watch mode
- `npm run build` - Build the Vite bundle (client only)
- `npm run preview` - Serve the built bundle
- `npm run lint` - Run ESLint on both client and server code

### Backend Setup (Python Environment)
Before starting the application, set up the Python environment for SAM/SAM2 segmentation:
```bash
cd server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

Required environment variables for model paths (set only those you use):
```bash
export SEGMENTATION_PYTHON_PATH=/path/to/python  # optional, defaults to python3
export SEGMENTATION_DEFAULT_ALGORITHM=sam2       # optional (sam | sam2)
export SEGMENTATION_DEFAULT_MODEL_SIZE=base      # optional (tiny|small|base|large)

# SAM model paths
export SAM_MODEL_TINY_PATH=/models/sam_t.pt
export SAM_MODEL_SMALL_PATH=/models/sam_s.pt
export SAM_MODEL_BASE_PATH=/models/sam_b.pt
export SAM_MODEL_LARGE_PATH=/models/sam_l.pt

# SAM2 model paths
export SAM2_MODEL_TINY_PATH=/models/sam2_t.pt
export SAM2_MODEL_SMALL_PATH=/models/sam2_s.pt
export SAM2_MODEL_BASE_PATH=/models/sam2_b.pt
export SAM2_MODEL_LARGE_PATH=/models/sam2_l.pt
```

## Architecture

### Frontend (React + TypeScript + Vite)
- **State Management**: Zustand store (`src/hooks/useImageStore.ts`) for image management
- **Component Structure**:
  - `App.tsx` - Main application with root directory configuration
  - `ImageUploader.tsx` - File/folder upload interface
  - `ImageGrid.tsx` - Grid display of uploaded images with status
  - `ImageSegmentationModal.tsx` - 5-step wizard for image processing
- **API Layer**: `src/lib/api.ts` handles communication with backend endpoints
- **Type System**: Comprehensive TypeScript types in `src/types/` for images, labels, and prompts

### Backend (Node.js + Express + Python)
- **API Server**: `server/index.ts` - Express server with CORS and file upload handling
- **Segmentation**: Python integration via `server/segmentationRunner.ts` calling `server/run_segmentation.py`
- **Preprocessing**: Grayscale processing via `server/preprocessRunner.ts` calling `server/run_preprocess.py`
- **File Management**: `server/saveMask.ts` handles saving masks to labeled directories

### Key Workflows

#### Image Processing Pipeline
1. **Upload**: Single images or folders via drag-and-drop
2. **Root Configuration**: Set base directory for mask storage (saved in localStorage)
3. **Segmentation Wizard**: 5-step modal workflow:
   - **Crop**: Select area to crop or skip
   - **Segment**: Choose Points/Boundary, algorithm (SAM/SAM2), model size
   - **Normalize**: Resize (224×224 or 320×320), apply rotations/flips
   - **Grayscale**: Apply OpenCV filters (standard, CLAHE, adaptive, gaussian)
   - **Review**: Final verification and label assignment

#### Backend API Endpoints
- `POST /api/segment` - Main segmentation endpoint with multipart form data
- `POST /api/preprocess/grayscale` - Image preprocessing with various OpenCV filters
- `POST /api/save-mask` - Save segmented masks to labeled directories
- `GET /health` - Health check endpoint

### File Organization
- `src/` - Frontend React application
- `server/` - Backend API and Python integration
- Model files (`.pt`) should be placed in the `server/` directory or paths configured via environment variables

### Development Notes
- The frontend uses Vite with path aliases (`@` maps to `src/`)
- ESLint configuration includes React, TypeScript, and import rules
- Server runs on port 4000, client on port 5173 with automatic proxy for `/api`
- Debug logging uses `console.debug` with `[wizard]` prefix for workflow tracking
- Image processing state is managed per-image with status tracking (idle, processing, complete, error)