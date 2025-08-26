import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, AlertTriangle, Bell, Video, ClipboardList, BookOpen, Play, Shield, FileText, Languages, Plus, Download } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

// ------------------------- Mock Data & Types -------------------------

type Literacy = "low" | "medium" | "high";

type Persona = {
  id: string;
  name: string;
  age: number;
  language: "en" | "zh" | "ar" | "vi" | "ur" | "yue";
  literacy: Literacy;
  techAccess: "smartphone" | "tablet" | "computer";
  risk: number; // 0-100 risk of cancellation proxy
};

type Task = { id: string; label: string; dueDays: number; completed: boolean; timestamp?: string };

type QuizQ = { id: string; question: string; options: string[]; answerIndex: number };

type PatientRecord = {
  personaId: string;
  tasks: Task[];
  quizScore?: number; // 0-100
  comprehensionFlag?: boolean; // true if low
  notes?: string;
};

const PERSONAS: Persona[] = [
  { id: "p1", name: "Aunty May", age: 68, language: "en", literacy: "low", techAccess: "smartphone", risk: 65 },
  { id: "p2", name: "Michael", age: 25, language: "zh", literacy: "high", techAccess: "computer", risk: 20 },
  { id: "p3", name: "Fatima", age: 54, language: "ar", literacy: "medium", techAccess: "smartphone", risk: 45 },
  { id: "p4", name: "Lan", age: 37, language: "vi", literacy: "low", techAccess: "tablet", risk: 55 },
];

const BASE_TASKS: Task[] = [
  { id: "t1", label: "Watch fasting prep video", dueDays: 5, completed: false },
  { id: "t2", label: "Read medication guide", dueDays: 4, completed: false },
  { id: "t3", label: "Complete comprehension quiz", dueDays: 3, completed: false },
  { id: "t4", label: "Confirm transport plan", dueDays: 2, completed: false },
];

const QUIZ: QuizQ[] = [
  { id: "q1", question: "When should you stop eating solid food before surgery?", options: ["2 hours", "6 hours", "12 hours", "No need to stop"], answerIndex: 1 },
  { id: "q2", question: "On the morning of surgery, you should:", options: ["Take all meds as usual", "Skip all meds", "Follow the doctor's specific instructions", "Drink coffee and juice"], answerIndex: 2 },
  { id: "q3", question: "If unsure about instructions, you should:", options: ["Guess", "Call the hospital/telehealth line", "Search random forums", "Do nothing"], answerIndex: 1 },
];

// Content variants (simple vs standard). In real use, feed through SHeLL for grade targets.
const CONTENT_EN = {
  simple: `Your surgery is coming up. Stop eating solid food 6 hours before. You can drink small sips of water up to 2 hours before. Take only the medicines your doctor said are okay. If confused, call us. We are here to help.`,
  standard: `For elective surgery preparation, cease solid foods 6 hours pre‑procedure and limit clear fluids to small volumes up to 2 hours prior. Continue only medications sanctioned by your clinician. If any ambiguity remains, contact the perioperative team for clarification.`,
};

const LANGUAGE_LABEL: Record<Persona["language"], string> = {
  en: "English",
  zh: "中文",
  ar: "العربية",
  vi: "Tiếng Việt",
  ur: "اردو",
  yue: "粵語",
};

// ------------------------- Utility (Mock Readability + Audit) -------------------------

function estimateGradeLevel(text: string): number {
  // Lightweight proxy: proportion of long words -> rough grade level estimate
  const words = text.trim().split(/\s+/);
  const hard = words.filter((w) => w.replace(/[^a-zA-Z]/g, "").length >= 8).length;
  const ratio = words.length ? hard / words.length : 0;
  return Math.min(14, Math.max(2, Math.round(4 + ratio * 12)));
}

const nowISO = () => new Date().toISOString();

// ------------------------- Integration Stubs -------------------------

function sendTeamsReminderStub(persona: Persona, task: Task) {
  return {
    type: "teams_reminder",
    when: nowISO(),
    to: persona.name,
    payload: {
      message: `Reminder: ${task.label} due in ${task.dueDays} day(s)`,
      channel: "PowerAutomateWebhook",
      locale: LANGUAGE_LABEL[persona.language],
    },
  };
}

function createRedcapRecordStub(persona: Persona, record: PatientRecord) {
  return {
    type: "redcap_create",
    when: nowISO(),
    projectId: "DEMO-REDCAP-123",
    payload: {
      patient: persona.name,
      tasks: record.tasks.map((t) => ({ id: t.id, completed: t.completed, ts: t.timestamp ?? null })),
      quizScore: record.quizScore ?? null,
      comprehensionFlag: record.comprehensionFlag ?? null,
    },
  };
}

function scheduleHealthdirectCallStub(persona: Persona, reason: string) {
  return {
    type: "healthdirect_call",
    when: nowISO(),
    payload: {
      patient: persona.name,
      reason,
      urgency: "next_business_day",
    },
  };
}

// ------------------------- Main Component -------------------------

export default function DigitalOnboardingPrototype() {
  const [selectedPersonaId, setSelectedPersonaId] = useState(PERSONAS[0].id);
  const selectedPersona = useMemo(() => PERSONAS.find((p) => p.id === selectedPersonaId)!, [selectedPersonaId]);

  const [records, setRecords] = useState<Record<string, PatientRecord>>(() => {
    const init: Record<string, PatientRecord> = {};
    PERSONAS.forEach((p) => (init[p.id] = { personaId: p.id, tasks: JSON.parse(JSON.stringify(BASE_TASKS)) }));
    return init;
  });

  const record = records[selectedPersonaId];
  const [audit, setAudit] = useState<any[]>([]);

  // Admin config (demonstrates enhancement strategy levers)
  const [requireGrade6, setRequireGrade6] = useState(true);
  const [autoReminders, setAutoReminders] = useState(true);
  const [enableMultilang, setEnableMultilang] = useState(true);

  const contentVariant = selectedPersona.literacy === "low" ? CONTENT_EN.simple : CONTENT_EN.standard;
  const grade = estimateGradeLevel(contentVariant);
  const gradeOk = requireGrade6 ? grade <= 6 : true;

  const [videoWatched, setVideoWatched] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});

  const adherenceRate = useMemo(() => {
    const completed = record.tasks.filter((t) => t.completed).length;
    return Math.round((completed / record.tasks.length) * 100);
  }, [record.tasks]);

  const quizScore = useMemo(() => {
    let correct = 0;
    QUIZ.forEach((q) => {
      if (quizAnswers[q.id] === q.answerIndex) correct += 1;
    });
    return Math.round((correct / QUIZ.length) * 100);
  }, [quizAnswers]);

  // Update storage + audit helper
  function updateRecord(next: Partial<PatientRecord>) {
    const merged = { ...record, ...next };
    setRecords((prev) => ({ ...prev, [selectedPersonaId]: merged }));
  }

  function completeTask(taskId: string) {
    const updated = record.tasks.map((t) => (t.id === taskId ? { ...t, completed: true, timestamp: nowISO() } : t));
    updateRecord({ tasks: updated });
    const t = updated.find((x) => x.id === taskId)!;
    setAudit((a) => [sendTeamsReminderStub(selectedPersona, t), ...a]);
  }

  function submitQuiz() {
    const score = quizScore;
    const comprehensionFlag = score < 67; // threshold for extra support
    updateRecord({ quizScore: score, comprehensionFlag });
    setAudit((a) => [createRedcapRecordStub(selectedPersona, { ...record, quizScore: score, comprehensionFlag }), ...a]);
    if (comprehensionFlag) setAudit((a) => [scheduleHealthdirectCallStub(selectedPersona, "Low quiz score"), ...a]);
    // Auto-complete related task if present
    if (!record.tasks.find((t) => t.id === "t3")?.completed) completeTask("t3");
  }

  function exportConfig() {
    const payload = {
      redcapProjectId: "DEMO-REDCAP-123",
      teamsFlow: autoReminders ? "Enabled: Power Automate Webhook" : "Disabled",
      healthdirect: "On-demand escalation for low literacy/low comprehension",
      contentPolicy: requireGrade6 ? "Target reading grade <= 6" : "No constraint",
      multilingual: enableMultilang ? "Enabled" : "Disabled",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "onboarding-config.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Clinician dashboard aggregate (over all personas)
  const dashboardData = useMemo(() => {
    return PERSONAS.map((p) => {
      const r = records[p.id];
      const comp = r?.quizScore ?? 0;
      const adh = r ? Math.round((r.tasks.filter((t) => t.completed).length / r.tasks.length) * 100) : 0;
      const flag = (r?.comprehensionFlag ? 1 : 0) + (adh < 60 ? 1 : 0) + (p.risk > 50 ? 1 : 0);
      return { name: p.name, Adherence: adh, Comprehension: comp, RiskFlags: flag };
    });
  }, [records]);

  // ------------------------- UI -------------------------

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Digital Patient Onboarding – Prototype</h1>
        <Badge variant="secondary">Demo • Systems Analysis & Design</Badge>
      </div>

      <Tabs defaultValue="patient" className="w-full">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="patient">Patient Module</TabsTrigger>
          <TabsTrigger value="clinician">Clinician Dashboard</TabsTrigger>
          <TabsTrigger value="admin">Admin & Config</TabsTrigger>
          <TabsTrigger value="audit">Audit & Governance</TabsTrigger>
        </TabsList>

        {/* Patient Module */}
        <TabsContent value="patient" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BookOpen className="w-5 h-5"/> Select Persona</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Persona</Label>
                <div className="flex flex-wrap gap-2">
                  {PERSONAS.map((p) => (
                    <Button key={p.id} variant={p.id === selectedPersonaId ? "default" : "outline"} onClick={() => setSelectedPersonaId(p.id)}>{p.name} · {LANGUAGE_LABEL[p.language]}</Button>
                  ))}
                </div>
                <div className="text-sm text-muted-foreground">Literacy: <b>{selectedPersona.literacy}</b> · Tech: <b>{selectedPersona.techAccess}</b> · Risk: <b>{selectedPersona.risk}</b></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Language</Label>
                  <Input value={LANGUAGE_LABEL[selectedPersona.language]} readOnly />
                </div>
                <div className="flex items-center gap-3 mt-6">
                  <Switch checked={enableMultilang} onCheckedChange={setEnableMultilang} id="ml"/>
                  <Label htmlFor="ml" className="cursor-pointer flex items-center gap-2"><Languages className="w-4 h-4"/> Enable Multi-language (mock)</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Video className="w-5 h-5"/> Multimedia Education</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="aspect-video rounded-xl bg-gray-100 flex items-center justify-center">
                  <div className="text-center">
                    <Play className="w-10 h-10 mx-auto mb-2"/>
                    <div className="text-sm text-muted-foreground">Video placeholder – "Fasting & Medication"</div>
                  </div>
                </div>
                <Button onClick={() => { setVideoWatched(true); completeTask("t1"); }} variant="secondary" className="w-full"><CheckCircle className="w-4 h-4 mr-2"/> Mark video as watched</Button>
                <Separator/>
                <Label>Instructional Text ({selectedPersona.literacy === "low" ? "Simple" : "Standard"})</Label>
                <Textarea value={contentVariant} readOnly className="min-h-[130px]"/>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4"/>
                  <span className="text-sm">Estimated reading grade: <b>{grade}</b> {requireGrade6 && (<Badge variant={gradeOk ? "default" : "destructive"} className="ml-2">{gradeOk ? "Meets ≤ 6" : "> 6 – revise"}</Badge>)} </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ClipboardList className="w-5 h-5"/> Tasks & Reminders</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {record.tasks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-xl border p-3">
                    <div>
                      <div className="font-medium">{t.label}</div>
                      <div className="text-xs text-muted-foreground">Due in {t.dueDays} day(s)</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {t.completed ? (
                        <Badge className="bg-green-600">Done</Badge>
                      ) : (
                        <Button size="sm" onClick={() => completeTask(t.id)}><CheckCircle className="w-4 h-4 mr-1"/> Complete</Button>
                      )}
                      <Button size="icon" variant="outline" onClick={() => setAudit((a) => [sendTeamsReminderStub(selectedPersona, t), ...a])} title="Send reminder (Teams stub)"><Bell className="w-4 h-4"/></Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Comprehension Quiz</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {QUIZ.map((q) => (
                <div key={q.id} className="p-3 rounded-xl border">
                  <div className="font-medium mb-2">{q.question}</div>
                  <div className="grid gap-2">
                    {q.options.map((opt, idx) => (
                      <Button key={idx} variant={quizAnswers[q.id] === idx ? "default" : "outline"} className="justify-start" onClick={() => setQuizAnswers((prev) => ({ ...prev, [q.id]: idx }))}>{opt}</Button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">Current score: <b>{quizScore}</b>/100</div>
                <Button onClick={submitQuiz}>Submit Quiz</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Clinician Dashboard */}
        <TabsContent value="clinician" className="space-y-4">
          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Adherence & Comprehension Overview</CardTitle>
              </CardHeader>
              <CardContent style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboardData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="Adherence" />
                    <Bar dataKey="Comprehension" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Risk Flags</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {dashboardData.map((d) => (
                  <div key={d.name} className="flex items-center justify-between rounded-xl border p-3">
                    <div>
                      <div className="font-medium">{d.name}</div>
                      <div className="text-xs text-muted-foreground">Adherence {d.Adherence}% · Comp {d.Comprehension}%</div>
                    </div>
                    {d.RiskFlags > 0 ? (
                      <Badge className="bg-amber-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> {d.RiskFlags} flag(s)</Badge>
                    ) : (
                      <Badge className="bg-green-600">OK</Badge>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Persona Drill-down & Interventions</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Selected persona</Label>
                <div className="flex flex-wrap gap-2">
                  {PERSONAS.map((p) => (
                    <Button key={p.id} variant={p.id === selectedPersonaId ? "default" : "outline"} onClick={() => setSelectedPersonaId(p.id)}>{p.name}</Button>
                  ))}
                </div>
                <div className="text-sm text-muted-foreground">Risk {selectedPersona.risk} · Literacy {selectedPersona.literacy} · Language {LANGUAGE_LABEL[selectedPersona.language]}</div>
              </div>

              <div className="space-y-2">
                <Label>Interventions</Label>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setAudit((a) => [sendTeamsReminderStub(selectedPersona, { id: "custom", label: "General check-in", dueDays: 1, completed: false }), ...a])}><Bell className="w-4 h-4 mr-1"/> Send reminder</Button>
                  <Button variant="outline" onClick={() => setAudit((a) => [scheduleHealthdirectCallStub(selectedPersona, "Anxiety / low literacy support"), ...a])}><Video className="w-4 h-4 mr-1"/> Schedule Healthdirect call</Button>
                  <Button onClick={() => setAudit((a) => [createRedcapRecordStub(selectedPersona, record), ...a])}><FileText className="w-4 h-4 mr-1"/> Push snapshot to REDCap</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Admin & Config */}
        <TabsContent value="admin" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configuration (Enhancement Strategy Levers)</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2"><Shield className="w-4 h-4"/> Target Reading Grade ≤ 6</Label>
                  <Switch checked={requireGrade6} onCheckedChange={setRequireGrade6} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2"><Bell className="w-4 h-4"/> Auto Teams Reminders (stub)</Label>
                  <Switch checked={autoReminders} onCheckedChange={setAutoReminders} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2"><Languages className="w-4 h-4"/> Multi-language Content (mock)</Label>
                  <Switch checked={enableMultilang} onCheckedChange={setEnableMultilang} />
                </div>
              </div>
              <div className="space-y-3">
                <Label>Export Integration Config (JSON)</Label>
                <div className="flex items-center gap-2">
                  <Button onClick={exportConfig}><Download className="w-4 h-4 mr-1"/> Export</Button>
                  <Button variant="outline"><Plus className="w-4 h-4 mr-1"/> Add module (placeholder)</Button>
                </div>
                <div className="text-sm text-muted-foreground">Use this file to seed Power Automate flows, REDCap project metadata, or pipeline variables.</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Capability Map (At-a-glance)</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3 text-sm">
              <div className="space-y-2">
                <div className="font-medium">REDCap</div>
                <ul className="list-disc ml-5">
                  <li>Longitudinal surveys, checklists, branching logic</li>
                  <li>Quiz + timestamps (adherence & comprehension)</li>
                  <li>Exports to dashboards/EMR (via middleware)</li>
                </ul>
              </div>
              <div className="space-y-2">
                <div className="font-medium">Microsoft Teams (via Power Automate)</div>
                <ul className="list-disc ml-5">
                  <li>Automated reminders / escalation messaging</li>
                  <li>Clinician collaboration channels</li>
                  <li>Webhook-based triggers from onboarding tasks</li>
                </ul>
              </div>
              <div className="space-y-2">
                <div className="font-medium">Healthdirect Video Call</div>
                <ul className="list-disc ml-5">
                  <li>On-demand synchronous support</li>
                  <li>Low-literacy safeguarding (clarification)</li>
                </ul>
              </div>
              <div className="space-y-2">
                <div className="font-medium">SHeLL Editor</div>
                <ul className="list-disc ml-5">
                  <li>Readability scoring & simplification guidance</li>
                  <li>Supports Grade ≤ 6 target for accessibility</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit & Governance */}
        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Audit Log (Mock – Governance & Traceability)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground">Records stubbed actions that would be sent to REDCap/Teams/Healthdirect with timestamps.</div>
              <div className="space-y-2">
                {audit.length === 0 ? (
                  <div className="text-sm">No events yet. Complete a task, send a reminder, or submit a quiz to generate entries.</div>
                ) : (
                  audit.map((e, idx) => (
                    <div key={idx} className="rounded-xl border p-3">
                      <div className="font-mono text-xs">{e.when} · {e.type}</div>
                      <pre className="text-xs overflow-auto mt-1">{JSON.stringify(e.payload ?? e, null, 2)}</pre>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Governance Notes</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <p>• Data minimisation: prototype stores only necessary fields (tasks, quiz score, flags).</p>
              <p>• Security: replace stubs with secure endpoints, ensure encryption in transit/at rest per hospital policy.</p>
              <p>• Access controls: clinician dashboard segmented by role; patient module protected by identity provider.</p>
              <p>• Interoperability: use REDCap API tokens, Teams webhooks/Graph API, and Healthdirect scheduling API where approved.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
