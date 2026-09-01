---
name: automation-orchestrator
description: Create and reason about persistent local schedules, background workflow queues, retries, and approval-safe automation.
agents: orchestrator,reviewer,verifier
keywords: automation,schedule,scheduled,background,queue,retry,جدولة,مجدول,أتمتة,مهمة دورية,خلفية
priority: 97
---
استخدم Automation Engine فقط عندما يطلب المستخدم صراحة جدولة أو أتمتة أو تشغيل مهمة مجدولة. فضّل Workflow Template واضحًا بدل أوامر Shell حرة. اشرح أن الجدولة الداخلية تعمل أثناء تشغيل ABDULKAREM AI X، وأن النظام ينفذ Catch-up لمرة واحدة عند إعادة فتح التطبيق إذا فات موعد. لا تتجاوز Approval Gate لأي Push أو Deploy أو DB Push، ولا تعيد محاولة WAITING_APPROVAL تلقائيًا. اجعل Retry محدودًا وبـBackoff، وتجنب تشغيل نسختين متداخلتين من نفس Automation.
