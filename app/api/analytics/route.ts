
// ⚠️ منع Next.js من تخزين (cache) نتائج الـ API — دائماً اقرأ من DB مباشرة
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
import { requireAdmin } from "@/lib/server/admin-auth"
import { getLogsPool as getPool } from "@/lib/server/logs-db"


export async function GET(req: Request) {
  const deny = requireAdmin(req)
  if (deny) return deny

  try {
    const db = getPool()

    const [[overviewLogs], [overviewFb], recent, negativeNotes, daily, dailyFb, topTools, noResults, noTool, improvements, repeated] =
      await Promise.all([

        // إحصائيات عامة - chat_logs
        db.query(`
          SELECT
            COUNT(*) AS total,
            ROUND(AVG(response_time_ms)) AS avg_ms,
            SUM(was_tool_used) AS tool_used_count,
            SUM(was_tool_used = 0) AS no_tool_count
          FROM chat_logs
        `),

        // إحصائيات عامة - chat_feedback
        db.query(`
          SELECT
            COUNT(*) AS total_fb,
            SUM(rating = 'helpful') AS helpful,
            SUM(rating = 'not_helpful') AS not_helpful,
            ROUND(SUM(rating = 'helpful') * 100.0 / NULLIF(COUNT(*), 0), 1) AS satisfaction
          FROM chat_feedback
        `),

        // آخر 40 سؤال مع تقييمهم
        db.query(`
          SELECT
            cl.id, cl.user_question, cl.tool_called, cl.was_tool_used,
            cl.response_time_ms, cl.db_result_count, cl.final_answer,
            DATE_FORMAT(cl.created_at, '%Y-%m-%d %H:%i') AS created_at,
            cf.rating, cf.feedback_note
          FROM chat_logs cl
          LEFT JOIN chat_feedback cf ON cf.chat_log_id = cl.id
          ORDER BY cl.created_at DESC
          LIMIT 40
        `),

        // تقييمات سلبية مع ملاحظات
        db.query(`
          SELECT
            cl.user_question,
            cl.final_answer,
            cf.feedback_note,
            DATE_FORMAT(cf.created_at, '%Y-%m-%d %H:%i') AS created_at
          FROM chat_feedback cf
          JOIN chat_logs cl ON cl.id = cf.chat_log_id
          WHERE cf.rating = 'not_helpful'
          ORDER BY cf.created_at DESC
          LIMIT 30
        `),

        // إحصائيات يومية آخر 14 يوم
        db.query(`
          SELECT
            DATE_FORMAT(created_at, '%m/%d') AS day,
            COUNT(*) AS questions,
            ROUND(AVG(response_time_ms)) AS avg_ms,
            SUM(was_tool_used) AS tool_used
          FROM chat_logs
          WHERE created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
          GROUP BY DATE(created_at)
          ORDER BY DATE(created_at) ASC
        `),

        // تقييمات يومية آخر 14 يوم
        db.query(`
          SELECT
            DATE_FORMAT(created_at, '%m/%d') AS day,
            SUM(rating = 'helpful') AS helpful,
            SUM(rating = 'not_helpful') AS not_helpful
          FROM chat_feedback
          WHERE created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
          GROUP BY DATE(created_at)
          ORDER BY DATE(created_at) ASC
        `),

        // أكثر الأدوات استخداماً
        db.query(`
          -- توحيد الأسماء القديمة مع الحالية قبل التجميع، وإلا ظهرت الأداة
          -- الواحدة صفّين منفصلين بعد ترحيل التسمية (search_projects → search_content).
          -- الخريطة نسخة من LEGACY_TOOL_ALIASES في site-tools-definitions.ts.
          SELECT CASE tool_called
                   WHEN 'search_projects'      THEN 'search_content'
                   WHEN 'get_project_by_id'    THEN 'get_content_by_id'
                   WHEN 'filter_projects'      THEN 'list_news_categories'
                   WHEN 'get_latest_projects'  THEN 'get_latest_news'
                   WHEN 'get_statistics'       THEN 'get_content_statistics'
                   ELSE tool_called
                 END AS tool_called,
                 COUNT(*) AS cnt
          FROM chat_logs
          WHERE tool_called IS NOT NULL
          GROUP BY 1
          ORDER BY cnt DESC
          LIMIT 10
        `),

        // أسئلة لم تجد نتائج (was_tool_used=1 لكن db_result_count=0)
        // نستثني الأدوات التي تُعيد نتيجة منفردة وليس مصفوفة (أوقات الصلاة، الإحصائيات...)
        db.query(`
          SELECT user_question, tool_called, response_time_ms,
                 DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at
          FROM chat_logs
          WHERE was_tool_used = 1 AND db_result_count = 0
            AND (tool_called IS NULL OR tool_called NOT IN (
              'get_prayer_times', 'get_content_statistics', 'get_video_sections',
              'get_project_details', 'get_project_image', 'get_project_images',
              'get_news_images', 'get_content_by_id',
              -- أسماء ما قبل الترحيل (سجلّات تاريخية)
              'get_statistics', 'get_project_by_id'
            ))
          ORDER BY created_at DESC
          LIMIT 20
        `),

        // أسئلة أجاب عنها البوت بدون استخدام أداة بحث
        db.query(`
          SELECT user_question, response_time_ms, final_answer,
                 DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at
          FROM chat_logs
          WHERE was_tool_used = 0
          ORDER BY created_at DESC
          LIMIT 30
        `),

        // مهام التحسين: أسئلة لم تجد نتائج + تقييمات سلبية (مجمّعة)
        db.query(`
          SELECT
            user_question,
            SUM(issue_type = 'no_results') AS no_results_count,
            SUM(issue_type = 'negative_fb') AS negative_fb_count,
            COUNT(*) AS total_issues,
            DATE_FORMAT(MAX(created_at), '%Y-%m-%d %H:%i') AS last_seen
          FROM (
            SELECT user_question, 'no_results' AS issue_type, created_at
            FROM chat_logs
            WHERE was_tool_used = 1 AND db_result_count = 0
              AND (tool_called IS NULL OR tool_called NOT IN (
                'get_prayer_times','get_content_statistics','get_video_sections',
                'get_project_details','get_project_image','get_project_images',
                'get_news_images','get_content_by_id',
                'get_statistics','get_project_by_id'
              ))
            UNION ALL
            SELECT cl.user_question, 'negative_fb', cf.created_at
            FROM chat_feedback cf
            JOIN chat_logs cl ON cl.id = cf.chat_log_id
            WHERE cf.rating = 'not_helpful'
          ) combined
          GROUP BY user_question
          ORDER BY total_issues DESC, last_seen DESC
          LIMIT 25
        `),

        // أسئلة متكررة (تكررت أكثر من مرة)
        db.query(`
          SELECT user_question, COUNT(*) AS cnt,
                 DATE_FORMAT(MAX(created_at), '%Y-%m-%d %H:%i') AS last_seen,
                 ROUND(AVG(response_time_ms)) AS avg_ms
          FROM chat_logs
          GROUP BY user_question
          HAVING cnt > 1
          ORDER BY cnt DESC
          LIMIT 30
        `),
      ])

    return Response.json({
      overview: { ...(overviewLogs as any[])[0], ...(overviewFb as any[])[0] },
      recent: recent[0],
      negativeNotes: negativeNotes[0],
      daily: daily[0],
      dailyFb: dailyFb[0],
      topTools: topTools[0],
      noResults: noResults[0],
      noTool: noTool[0],
      improvements: improvements[0],
      repeated: repeated[0],
    }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" }
    })
  } catch (err: any) {
    console.error("[Analytics API]", err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
