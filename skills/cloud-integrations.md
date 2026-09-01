---
name: cloud-integrations
description: GitHub, Vercel and Supabase inspection plus human-approved cloud mutations through official CLIs with audit logging.
---

# Cloud Integrations v1.4

ابدأ بـ `integration_status` لمعرفة CLI المتوفر وحالة تسجيل الدخول. استخدم `integration_query` فقط للاستعلامات Read-only المسموحة.

للعمليات الكتابية استخدم `integration_propose` فقط لإنشاء Preview/Approval Request. لا يجوز للAgent تنفيذ الموافقة أو تجاوزها. المستخدم وحده يضغط موافقة من واجهة Integration Hub.

العمليات الكتابية المسموحة حاليًا:
- GitHub: `push_current`, `pr_create`
- Vercel: `deploy_preview`, `deploy_production`
- Supabase: `db_push`

كل Proposal قصير العمر، Single-use، ومربوط ببصمة Workspace. إذا تغيّر المشروع بعد المعاينة، يجب إنشاء Proposal جديد. لا تدّع نجاح Push/Deploy/DB Push قبل ظهور نتيجة التنفيذ بعد الموافقة.
