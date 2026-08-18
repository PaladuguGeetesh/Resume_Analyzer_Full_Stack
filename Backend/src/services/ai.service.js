const { GoogleGenAI } = require("@google/genai");
const Groq = require("groq-sdk");
const { z } = require("zod");
const { zodToJsonSchema } = require("zod-to-json-schema");
const puppeteer = require("puppeteer");
const CircuitBreaker = require("opossum");

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GENAI_API_KEY,
});

// TEMP DEBUG (requirement 4): confirm GROQ_API_KEY is actually present at construction
// time without printing the key itself — remove once the Groq fallback is confirmed working.
console.log(
  `[DEBUG groq-init] GROQ_API_KEY is ${process.env.GROQ_API_KEY ? `SET (${process.env.GROQ_API_KEY.length} chars)` : "UNDEFINED/EMPTY"}`,
);

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

class AIServiceUnavailableError extends Error {
  constructor(message = "AI service is temporarily unavailable, please try again later") {
    super(message);
    this.name = "AIServiceUnavailableError";
  }
}

const interviewReportSchema = z.object({
  matchScore: z
    .number()
    .describe(
      "the match score between the candidate profile and the job describe on the basis of resume and self describe provided by the candidate",
    ),
  technicalQuestions: z
    .array(
      z.object({
        question: z
          .string()
          .describe("the technical question can be asked in the interview"),
        intention: z
          .string()
          .describe("the intention of interviewer behind asking the question"),
        answer: z
          .string()
          .describe(
            "how to answer this question ,what points to cover ,what approach to take etc.",
          ),
      }),
    )
    .describe(
      "the technical questions that can be asked in the interview with detailed answer and approach to answer",
    ),
  behavioralQuestions: z
    .array(
      z.object({
        question: z
          .string()
          .describe("the behavioural question can be asked in the interview"),
        intention: z
          .string()
          .describe("the intention of interviewer behind asking the question"),
        answer: z
          .string()
          .describe(
            "how to answer this question ,what points to cover ,what approach to take etc.",
          ),
      }),
    )
    .describe(
      "the behavioural questions that can be asked in the interview with detailed answer and approach to answer",
    ),
  skillGaps: z
    .array(
      z.object({
        skill: z
          .string()
          .describe(
            "the skill gap that the candidate has for the applied job role",
          ),
        severity: z
          .enum(["low", "medium", "high"])
          .describe("the severity of the skill gap"),
      }),
    )
    .describe("the skill gaps that the candidate has for the applied job role"),
  preparationPlan: z
    .array(
      z.object({
        day: z.number().describe("the day number of the preparation plan"),
        focus: z
          .string()
          .describe("the focus area for that day in the preparation plan"),
        tasks: z
          .array(z.string())
          .describe("the tasks to be done on that day for preparation"),
      }),
    )
    .describe(
      "the preparation plan for the candidate to prepare for the interview",
    ),
  title: z.string().describe("the title of the interview report"),
});

// Shared by both providers: Gemini gets this text AND a responseSchema constraint,
// Groq only gets this text (its JSON mode guarantees valid JSON, not conformance to a
// schema), which is why the structure is spelled out in full here rather than relying
// on either provider's schema mechanism alone.
function buildInterviewReportPrompt({ resume, selfDescription, jobDescription }) {
  return `You are an expert technical interviewer, recruiter, and hiring manager.

Your task is to analyze the candidate's Resume, Self Description, and Job Description and generate an interview preparation report.

IMPORTANT INSTRUCTIONS:

* Return ONLY valid JSON.
* Do not include markdown.
* Do not include explanations outside JSON.
* Follow the required structure exactly.
* Do not flatten arrays.
* Every element inside arrays must be an object with the specified fields.
* Do not omit any field.
* Use realistic and detailed answers.
* matchScore must be between 0 and 100.

Required JSON Structure:

{
"title": string,

"matchScore": number,

"technicalQuestions": [
{
"question": string,
"intention": string,
"answer": string
}
],

"behavioralQuestions": [
{
"question": string,
"intention": string,
"answer": string
}
],

"skillGaps": [
{
"skill": string,
"severity": "low" | "medium" | "high"
}
],

"preparationPlan": [
{
"day": number,
"focus": string,
"tasks": [
string
]
}
]
}

Requirements:

1. Generate 5 technical questions.
2. Generate 3 behavioural questions.
3. Generate at least 3 skill gaps.
4. Generate a preparation plan for 7 days.
5. Each day in preparationPlan MUST be an object.
6. tasks MUST be an array of strings.
7. "title" is REQUIRED — a short, specific title for this report (e.g. "Senior Backend Engineer Interview Prep"), based on the job description. Never omit it.
8. "day" MUST be a JSON number (e.g. 1, 2, 3), never a quoted string (e.g. NOT "1", "2", "3").
9. Do NOT return:

[
"Day 1",
"Focus",
"Task"
]

This is INVALID.

Correct example:

"preparationPlan": [
{
"day": 1,
"focus": "Node.js Internals",
"tasks": [
"Study Event Loop",
"Practice Streams",
"Review Buffers"
]
},
{
"day": 2,
"focus": "Databases",
"tasks": [
"Study Indexing",
"Practice Aggregation Pipelines",
"Review Transactions"
]
}
]

Similarly, technicalQuestions MUST look like:

"technicalQuestions": [
{
"question": "...",
"intention": "...",
"answer": "..."
}
]

NOT:

[
"question",
"intention",
"answer"
]

Resume:

${resume}

Self Description:

${selfDescription}

Job Description:

${jobDescription}

Generate the interview report now.

                    `;
}

async function callGeminiForInterviewReport({
  resume,
  selfDescription,
  jobDescription,
}) {
  if (process.env.SIMULATE_AI_FAILURE === "true") {
    throw new Error("Simulated AI failure (SIMULATE_AI_FAILURE=true)");
  }

  const prompt = buildInterviewReportPrompt({ resume, selfDescription, jobDescription });

  const response = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: zodToJsonSchema(interviewReportSchema),
      temperature: 0.1,
    },
  });

  return { ...JSON.parse(response.text), generatedBy: "gemini" };
}

// Backup provider, invoked only from the circuit breaker's fallback once Gemini has
// genuinely tripped (see interviewReportBreaker.fallback below). Groq's JSON mode
// guarantees syntactically valid JSON but — unlike Gemini's responseSchema — gives no
// guarantee the shape matches interviewReportSchema, so the result is validated here and
// retried once on a schema mismatch before giving up and letting the caller fall through
// to AIServiceUnavailableError.
async function callGroqForInterviewReport({
  resume,
  selfDescription,
  jobDescription,
}) {
  const prompt = buildInterviewReportPrompt({ resume, selfDescription, jobDescription });

  async function attempt() {
    let completion;
    try {
      completion = await groq.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });
    } catch (apiErr) {
      // TEMP DEBUG (requirement 1): the Groq API call itself failed (network/auth/model
      // error) — print what actually happened before it gets swallowed further up.
      console.error("[DEBUG groq-fallback] Groq API call threw:", apiErr.message);
      console.error(apiErr.stack);
      throw apiErr;
    }

    const rawContent = completion.choices[0].message.content;
    // TEMP DEBUG (requirement 2): raw, unparsed text Groq returned, logged before any
    // JSON.parse/Zod validation is attempted.
    console.log("[DEBUG groq-fallback] raw Groq response text:", rawContent);

    const parsed = JSON.parse(rawContent);

    try {
      return interviewReportSchema.parse(parsed);
    } catch (zodErr) {
      // TEMP DEBUG (requirement 3): the specific field(s) that failed validation, not
      // just "validation failed" — zod v3 exposes this as both .issues and .errors.
      console.error(
        "[DEBUG groq-fallback] Zod validation failed, issues:",
        JSON.stringify(zodErr.issues, null, 2),
      );
      throw zodErr;
    }
  }

  let result;
  try {
    result = await attempt();
  } catch (err) {
    // one retry: Groq's JSON mode has no schema constraint, so a single malformed
    // response (missing field, flattened array, etc.) is worth one more shot before
    // treating it as a real failure
    result = await attempt();
  }

  return { ...result, generatedBy: "groq" };
}

const resumePdfSchema = z.object({
  html: z
    .string()
    .describe(
      "The Html content of the resume which can be converted to pdf using any library like puppeteer",
    ),
});

// Prompt content, schema, and the "do not fabricate" instruction are unchanged from before
// this refactor — only factored out into a function so both providers send identical text,
// same reasoning as buildInterviewReportPrompt above.
function buildResumePdfPrompt({ resume, selfDescription, jobDescription }) {
  return `Generate resume for a candidate with the following details:
                      Resume: ${resume}
                      Self Description: ${selfDescription}
                      Job Description: ${jobDescription}

                      Do not generate or include any experience, skills, achievements, or details that do not already exist in the candidate's resume — only use and rephrase what is genuinely present.

                      the response should be a JSON object with a single field "html" which contains the HTML content of the resume which can be converted to PDF using any library like puppeteer.
                      The resume should be tailored for the given job description and should highlight the candidate's strengths and relevant experience. The HTML content should be well-formatted and structured, making it easy to read and visually appealing.
                      The content of resume should be not sound like it's generated by AI and should be as close as possible to a real human-written resume.
                      you can highlight the content using some colors or different font styles but the overall design should be simple and professional.
                      The content should be ATS friendly, i.e. it should be easily parsable by ATS systems without losing important information.
                      The resume should not be so lengthy, it should ideally be 1-2 pages long when converted to PDF. Focus on quality rather than quantity and make sure to include all the relevant information that can increase the candidate's chances of getting an interview call for the given job description.
                  `;
}

async function callGeminiForResumePdf({ resume, selfDescription, jobDescription }) {
  const prompt = buildResumePdfPrompt({ resume, selfDescription, jobDescription });

  const response = await ai.models.generateContent({
    model: "gemini-flash-lite-latest",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: zodToJsonSchema(resumePdfSchema),
      temperature: 0.1,
    },
  });

  return { ...JSON.parse(response.text), generatedBy: "gemini" };
}

// Mirrors callGroqForInterviewReport: JSON mode gives no schema guarantee, so validate
// against resumePdfSchema and retry once on a mismatch before giving up.
async function callGroqForResumePdf({ resume, selfDescription, jobDescription }) {
  const prompt = buildResumePdfPrompt({ resume, selfDescription, jobDescription });

  async function attempt() {
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const parsed = JSON.parse(completion.choices[0].message.content);
    return resumePdfSchema.parse(parsed);
  }

  let result;
  try {
    result = await attempt();
  } catch (err) {
    result = await attempt();
  }

  return { ...result, generatedBy: "groq" };
}

// Per-feature provider maps — this is the whole abstraction. Adding a third provider (e.g.
// Claude) later means writing callClaudeForInterviewReport/callClaudeForResumePdf and adding
// one entry to each map below; PRIMARY_PROVIDER_NAME, the breaker, callPrimaryProvider, and
// the fallback all stay untouched since they only ever look providers up by name.
const INTERVIEW_REPORT_PROVIDERS = {
  gemini: callGeminiForInterviewReport,
  groq: callGroqForInterviewReport,
};

const RESUME_PDF_PROVIDERS = {
  gemini: callGeminiForResumePdf,
  groq: callGroqForResumePdf,
};

// Keyed by task type so one breaker (see callPrimaryProvider below) can dispatch to
// whichever feature's provider map is relevant for a given call.
const TASK_PROVIDERS = {
  interviewReport: INTERVIEW_REPORT_PROVIDERS,
  resumePdf: RESUME_PDF_PROVIDERS,
};

// Which provider sits behind the breaker (primary, gets wrapped + retried by opossum)
// vs. which one the fallback calls (secondary, only invoked once the breaker trips) is
// a config choice, not a hardcoded one — flip AI_PRIMARY_PROVIDER to swap them without
// touching the breaker wiring below. Anything other than "groq" defaults to "gemini".
// Shared by every AI-backed feature (interview reports AND resume PDFs) — one env var,
// one provider choice, applied everywhere via TASK_PROVIDERS.
const PRIMARY_PROVIDER_NAME = process.env.AI_PRIMARY_PROVIDER === "groq" ? "groq" : "gemini";
const SECONDARY_PROVIDER_NAME = PRIMARY_PROVIDER_NAME === "gemini" ? "groq" : "gemini";

// Every value below is overridable via env vars so tests can swap in a fast,
// test-scale breaker (short timeout, low volumeThreshold) without touching these
// production defaults — see tests/circuitBreaker.test.js.
const interviewReportBreakerOptions = {
  // ceiling for a single call — real calls run ~60s, this gives headroom before opossum calls it a timeout
  timeout: Number(process.env.AI_BREAKER_TIMEOUT_MS) || 75000, // 75s

  // require a real sample before trusting the failure %
  volumeThreshold: Number(process.env.AI_BREAKER_VOLUME_THRESHOLD) || 3,

  // % of calls in the window that must fail to trip the breaker
  errorThresholdPercentage: Number(process.env.AI_BREAKER_ERROR_THRESHOLD_PERCENTAGE) || 50,

  // OPEN duration before a HALF_OPEN test call — roughly 2 bucket-widths of cooldown
  resetTimeout: Number(process.env.AI_BREAKER_RESET_TIMEOUT_MS) || 180000, // 3 min

  // 5 buckets × 90s each = 450s total window
  rollingCountTimeout: Number(process.env.AI_BREAKER_ROLLING_COUNT_TIMEOUT_MS) || 450000, // 7.5 min

  // bucket width = rollingCountTimeout / rollingCountBuckets — deliberately ≥ timeout,
  // so one full primary-provider call always fits inside a single bucket, never spans two
  rollingCountBuckets: Number(process.env.AI_BREAKER_ROLLING_COUNT_BUCKETS) || 5,
};

// opossum binds ONE action function to a breaker at construction time — .fire() always
// calls this exact function, there's no way to "fire a different function" through the
// same instance. So to genuinely SHARE one breaker's trip state across two different AI
// calls (interview reports, resume PDFs), the bound action itself has to be a small
// dispatcher keyed by task type — both generateInterviewReport and
// generateResumePdfViaProvider funnel through this same function, which is what makes a
// sustained outage detected via one feature correctly fast-fail the other too.
async function callPrimaryProvider({ type, params }) {
  return TASK_PROVIDERS[type][PRIMARY_PROVIDER_NAME](params);
}

const interviewReportBreaker = new CircuitBreaker(
  callPrimaryProvider,
  interviewReportBreakerOptions,
);

interviewReportBreaker.fallback(async ({ type, params }, err) => {
  // opossum calls this fallback for EVERY failed call, not just when the circuit
  // is actually open — so only route to the backup provider once the breaker has
  // genuinely tripped; otherwise preserve the real error (e.g. still gathering
  // failures toward volumeThreshold) so callers see what actually went wrong.
  if (!interviewReportBreaker.opened) {
    throw err;
  }

  // Calling the secondary provider directly (not via .fire()) is what keeps this from
  // touching the breaker's own stats/state — opossum only tracks calls to the wrapped
  // primary-provider function, so the secondary stepping in here doesn't count as a
  // primary success and doesn't delay the breaker's HALF_OPEN retry against the primary.
  try {
    console.warn(`[circuit-breaker] ${PRIMARY_PROVIDER_NAME} circuit is open — falling back to ${SECONDARY_PROVIDER_NAME} (task: ${type})`);
    return await TASK_PROVIDERS[type][SECONDARY_PROVIDER_NAME](params);
  } catch (fallbackErr) {
    console.error(`[circuit-breaker] ${SECONDARY_PROVIDER_NAME} fallback also failed: ${fallbackErr.message}`);
    throw new AIServiceUnavailableError();
  }
});

interviewReportBreaker.on("open", () => {
  console.error("[circuit-breaker] OPEN — AI service failing, short-circuiting new calls");
});

interviewReportBreaker.on("halfOpen", () => {
  console.log("[circuit-breaker] HALF_OPEN — attempting a test call to AI service");
});

interviewReportBreaker.on("close", () => {
  console.log("[circuit-breaker] CLOSED — AI service recovered, resuming normal calls");
});

async function generateInterviewReport(params) {
  return interviewReportBreaker.fire({ type: "interviewReport", params });
}

// Same breaker as generateInterviewReport (see callPrimaryProvider above) — a tripped
// breaker from repeated report-generation failures fast-fails this too, and vice versa,
// since both funnel through the same .fire() call on the same instance.
async function generateResumePdfViaProvider(params) {
  return interviewReportBreaker.fire({ type: "resumePdf", params });
}

async function generatePdfFromHtml(htmlContent) {

  // --no-sandbox is required to run Chromium as root inside a container (the default
  // sandbox needs kernel privileges Docker doesn't grant without extra --cap-add setup)
  const browser=await puppeteer.launch({args:["--no-sandbox","--disable-setuid-sandbox"]})
  const page=await browser.newPage()
  await page.setContent(htmlContent,{waitUntil:"networkidle0"})

  const pdfBuffer = await page.pdf({
        format: "A4", margin: {
            top: "20mm",
            bottom: "20mm",
            left: "15mm",
            right: "15mm"
        }
    })

  await browser.close()
  return pdfBuffer
}

async function generateResumePdf({ resume, selfDescription, jobDescription }) {
  // AIServiceUnavailableError propagates up uncaught — generateResumePdfController is
  // responsible for turning it into a clean 503 (this stays a synchronous request-path
  // call, not a queued job, so there's no worker.js-equivalent to catch it instead).
  const { html } = await generateResumePdfViaProvider({ resume, selfDescription, jobDescription });

  const pdfBuffer = await generatePdfFromHtml(html);

  return pdfBuffer;
}

module.exports = {
  generateInterviewReport,
  generateResumePdf,
  AIServiceUnavailableError,
  interviewReportBreaker,
  PRIMARY_PROVIDER_NAME,
  SECONDARY_PROVIDER_NAME,
};
