# Interview AI - AI-Powered Job Preparation Platform

An AI-powered job preparation platform built with the MERN stack and Google Gemini API that helps users analyze resumes, generate ATS-friendly resumes, and receive personalized interview reports and feedback based on job descriptions.

## Features

* Resume analysis using Google Gemini AI
* AI-generated interview reports and personalized feedback
* ATS-friendly resume generation with PDF export
* Secure authentication using JWT
* Token blacklisting for secure logout
* Protected routes and role-based access control
* Responsive and user-friendly interface
* Centralized state management using Context API
* Modular frontend architecture (UI → Hooks → State → API)

---

## Tech Stack

### Frontend

* React.js
* React Router
* Context API
* Axios
* SCSS

### Backend

* Node.js
* Express.js
* MongoDB
* Mongoose
* JWT
* Bcrypt

### AI & Document Generation

* Google Gemini API
* Puppeteer

---

## Project Structure

```
frontend/
│
├── src/
│   ├── api/
│   ├── hooks/
│   ├── state/
│   ├── components/
│   ├── pages/
│   └── utils/

backend/
│
├── src/
│   ├── controllers/
│   ├── routes/
│   ├── middleware/
│   ├── models/
│   ├── services/
│   └── config/
```

### Frontend Architecture

The frontend follows a layered architecture:

```
UI Layer
    ↓
Hooks Layer
    ↓
State Layer
    ↓
API Layer
```

This separation improves maintainability, scalability, and code reusability.

---

## Installation

### Clone the Repository

```bash
git clone https://github.com/ankurdotio/interview-ai-yt.git

cd interview-ai-yt
```

---

## Backend Setup

Move to the backend directory:

```bash
cd backend
```

Install dependencies:

```bash
npm install
```

Create a `.env` file:

```env
PORT=3000

MONGO_URI=your_mongodb_connection_string

JWT_SECRET=your_jwt_secret

GEMINI_API_KEY=your_gemini_api_key

REDIS_URL=redis://localhost:6379
```

Start the backend server:

```bash
npm run dev
```

Server runs at:

```
http://localhost:3000
```

Report generation and resume-PDF generation run as separate background workers (BullMQ) — start each in its own terminal:

```bash
npm run worker:reports
npm run worker:resumes
```

---

## Frontend Setup

Open a new terminal:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Create a `.env` file:

```env
VITE_API_URL=http://localhost:3000/api
```

Start the frontend:

```bash
npm run dev
```

Frontend runs at:

```
http://localhost:5173
```

---

## Authentication Flow

1. User registers or logs in.
2. JWT token is generated.
3. Protected routes validate user authentication.
4. Tokens are blacklisted during logout.
5. Unauthorized users cannot access protected resources.

---

## AI Workflow

1. User uploads a resume.
2. User provides a job description.
3. Google Gemini API analyzes the data.
4. Interview reports and feedback are generated.
5. ATS-friendly resumes can be exported as PDFs.

---

## API Endpoints

### Authentication

```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

### Resume

```
POST /api/resume/analyze
POST /api/resume/generate
```

### Interview

```
POST /api/interview/report
```

---

## Future Improvements

* Interview question generation
* Real-time mock interviews
* Speech-to-text support
* Resume score visualization dashboard
* Multi-language support
* Email notifications

---

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create a new branch

```bash
git checkout -b feature-name
```

3. Commit changes

```bash
git commit -m "Add feature"
```

4. Push to GitHub

```bash
git push origin feature-name
```

5. Create a Pull Request

---


