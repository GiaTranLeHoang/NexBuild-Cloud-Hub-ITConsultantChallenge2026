# NexBuild Cloud Hub (Denmark Goods Receiving & ATP Lookup)

> **Round 2 MVP** — IT Consultant Challenge 2026

NexBuild Cloud Hub automates the physical and digital receiving workflow for the Denmark Distribution Hub: from automated delivery note scanning and purchase order reconciliation to posting inventory to the hub and real-time Available-to-Promise (ATP) lookups.

---

## Repository Structure

```text
nexbuild-cloud-hub-mvp/
├── CLAUDE.md                        # Shared rules & guidelines for AI agents & developers
├── README.md                        # Project documentation & setup instructions
├── .gitignore                       # Git ignore rules for Python, DBs, and environment files
├── .env.example                     # Environment variable template
├── requirements.txt                 # Python dependencies
├── backend/                         # Backend service (FastAPI) [Gia]
│   ├── __init__.py
│   ├── main.py
│   ├── database.py
│   ├── schemas.py
│   ├── ai_ocr_service.py
│   ├── matching_engine.py
│   └── mock_erp_adapter.py
├── frontend/                        # Frontend workspace [Hung]
│   └── index.html
├── seed_data/                       # Test datasets & fixtures [Dau]
│   └── .gitkeep
├── tests/                           # Unit & integration tests [Dau]
│   └── .gitkeep
└── deliverables_docs/               # Competition submissions & architecture docs
    └── .gitkeep
```

---

## Team Ownership Boundaries

| Module / Folder | Owner | Role & Responsibility |
| :--- | :--- | :--- |
| `/backend` | **Gia** | Team Leader & Backend Architect (API, OCR, Matching Engine, ERP Adapter) |
| `/frontend` | **Hung** | Frontend Engineer (Web UI, Scan & Confirmation screens, ATP portal) |
| `/tests` & `/seed_data` | **Dau** | QA & Data Engineer (Unit/Integration tests, mock datasets, fixtures) |
| `/deliverables_docs` | **Team** | Solution design documentation & challenge deliverables |

---

## Getting Started

### 1. Prerequisites
- **Python 3.10+**
- **Git**

### 2. Clone Repository & Setup Virtual Environment
```bash
# Clone the repository
git clone <repo_url>
cd NexBuild-Cloud-Hub-ITConsultantChallenge2026

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# Linux/macOS:
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Configure Environment Variables
Copy the template and configure your local settings:
```bash
# Windows:
copy .env.example .env
# Linux/macOS:
cp .env.example .env
```
Update `.env` with your `GEMINI_API_KEY` (never commit `.env` to Git).

### 5. Running the Application
- **Backend (FastAPI)**:
  ```bash
  uvicorn backend.main:app --reload --port 8000
  ```
  API Docs will be available at: `http://localhost:8000/docs`

- **Frontend**:
  Open `frontend/index.html` in your browser or run a simple local web server:
  ```bash
  python -m http.server 3000 --directory frontend
  ```

- **Running Tests**:
  ```bash
  pytest
  ```

---

## System Guidelines & Standards
Please review [CLAUDE.md](file:///d:/NexBuild-Cloud-Hub-ITConsultantChallenge2026/CLAUDE.md) before contributing. All endpoints must follow the `/api/v1/` prefix and enforce `snake_case` keys in JSON payloads.

