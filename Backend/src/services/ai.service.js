const { GoogleGenAI } = require("@google/genai");
const { z } = require("zod");
const { zodToJsonSchema } = require("zod-to-json-schema");
const puppeteer = require("puppeteer");

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GENSI_API_KEY,
});

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
  behaviouralQuestions: z
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

async function generateInterviewReport({
  resume,
  selfDescription,
  jobDescription,
}) {
  const prompt = `You are an expert technical interviewer, recruiter, and hiring manager.

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
"matchScore": number,

"technicalQuestions": [
{
"question": string,
"intention": string,
"answer": string
}
],

"behaviouralQuestions": [
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
7. Do NOT return:

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

  const response = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: zodToJsonSchema(interviewReportSchema),
      temperature: 0.1,
    },
  });

  return JSON.parse(response.text);
}

async function generatePdfFromHtml(htmlContent) {

  const browser=await puppeteer.launch()
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
  const resumePdfSchema = z.object({
    html: z
      .string()
      .describe(
        "The Html content of the resume which can be converted to pdf using any library like puppeteer",
      ),
  });

  const propmt =
    `Generate resume for a candidate with the following details:
                        Resume: ${resume}
                        Self Description: ${selfDescription}
                        Job Description: ${jobDescription}

                        the response should be a JSON object with a single field "html" which contains the HTML content of the resume which can be converted to PDF using any library like puppeteer.
                        The resume should be tailored for the given job description and should highlight the candidate's strengths and relevant experience. The HTML content should be well-formatted and structured, making it easy to read and visually appealing.
                        The content of resume should be not sound like it's generated by AI and should be as close as possible to a real human-written resume.
                        you can highlight the content using some colors or different font styles but the overall design should be simple and professional.
                        The content should be ATS friendly, i.e. it should be easily parsable by ATS systems without losing important information.
                        The resume should not be so lengthy, it should ideally be 1-2 pages long when converted to PDF. Focus on quality rather than quantity and make sure to include all the relevant information that can increase the candidate's chances of getting an interview call for the given job description.
                    `

  const response = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents: propmt,
    config: {
      responseMimeType: "application/json",
      responseSchema: zodToJsonSchema(resumePdfSchema),
      temperature: 0.1,
    },
  });

  const jsonContent = JSON.parse(response.text);

  const pdfBuffer = await generatePdfFromHtml(jsonContent.html);

  return pdfBuffer;
}

module.exports = {
  generateInterviewReport,
  generateResumePdf
};
