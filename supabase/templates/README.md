# Supabase Auth email templates

These files are the versioned source for the hosted Supabase Auth templates used by the current One Reader flows. They share the same minimal shell as application emails and deliberately do not repeat the subject as the body heading.

| Supabase template | Subject | File |
|---|---|---|
| Magic link | Your link to One Reader | `magic-link.html` |
| Confirm signup | Confirm your email for One Reader | `confirmation.html` |
| Change email address | Confirm your new One Reader email | `email-change.html` |
| Email address changed notification | Your One Reader email was changed | `email-changed-notification.html` |

For the hosted project, synchronize the subject and HTML through the Supabase Email Templates dashboard or Management API. Use Resend as custom SMTP, and disable provider click/open tracking for Auth messages so confirmation URLs are not rewritten.

Only templates used by active product flows live here. Add invite, recovery, reauthentication, password, phone, identity or MFA templates when the corresponding product flow is enabled, rather than publishing unused messages.
