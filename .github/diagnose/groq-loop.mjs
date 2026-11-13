// Temporary: replays the assistant's first two Groq rounds with the real tools and prompt.
const m = await import(process.env.TOOLS_TS);
const role = "company_admin";
const system = m.systemPrompt({ name: "Test", role, today: new Date().toISOString().slice(0, 10) });
const tools = m.toolsFor(role).map(m.toOpenAITool);
const model = process.env.MODEL || "openai/gpt-oss-120b";
const messages = [{ role: "system", content: system }, { role: "user", content: "How many employees do we have?" }];
console.log("model", model, "tools", tools.length, "approx prompt chars", JSON.stringify(messages).length + JSON.stringify(tools).length);
for (let round = 0; round < 3; round++) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, tools, max_tokens: 3000, temperature: 0.1, reasoning_effort: "low", tool_choice: "auto" }),
  });
  const text = await res.text();
  console.log(`round ${round}: HTTP ${res.status}`, text.slice(0, 1200));
  if (!res.ok) break;
  const msg = JSON.parse(text).choices?.[0]?.message;
  const calls = msg?.tool_calls ?? [];
  if (!calls.length) break;
  const { reasoning, ...turn } = msg;
  messages.push(turn);
  for (const c of calls) messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify({ employees: 12, active: 10, trips: 40 }) });
}
