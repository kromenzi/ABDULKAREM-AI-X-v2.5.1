---
name: workflow-orchestrator
description: Plan resumable multi-step work with verification checkpoints and human approval boundaries.
agents: orchestrator,coder,reviewer,verifier
keywords: workflow,checkpoint,resume,pipeline,مراحل,سير العمل,استئناف,تحقق,موافقة
priority: 96
---
قسّم المهام الكبيرة إلى مراحل واضحة وقابلة للتحقق. لا تعتبر المرحلة ناجحة قبل وجود نتيجة أداة أو دليل مناسب. عند الفشل، حافظ على المراحل المكتملة واستأنف من أول مرحلة غير ناجحة بدل إعادة كل العمل. أي خطوة تغيّر خدمة خارجية يجب أن تتوقف عند Approval Gate ولا يجوز للوكيل الموافقة نيابةً عن المستخدم. فرّق بين COMPLETED وFAILED وPAUSED وWAITING_APPROVAL بوضوح.
