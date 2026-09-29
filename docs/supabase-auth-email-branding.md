# Crayons Bridge hosted Supabase Auth email templates

Use these in Supabase Dashboard → Authentication → Email Templates for the canonical shared project only.

Brand: Crayons Bridge
Site: https://bridge.crayonspictures.com
Logo: https://bridge.crayonspictures.com/brand/logo.png
Legal owner: StreamVista OPC Pvt Ltd

## Confirmation subject
Welcome to Crayons Bridge — confirm your email

## Confirmation HTML
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
  <img src="https://bridge.crayonspictures.com/brand/logo.png" alt="Crayons Bridge" width="190" style="max-width:190px;height:auto">
  <h2>Confirm your Crayons Bridge email</h2>
  <p>Confirm this email address to activate your Crayons Bridge workspace.</p>
  <p><a href="{{ .ConfirmationURL }}">Confirm email</a></p>
  <p>Crayons Bridge · StreamVista OPC Pvt Ltd</p>
</div>

## Recovery subject
Reset your Crayons Bridge password

## Recovery HTML
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
  <img src="https://bridge.crayonspictures.com/brand/logo.png" alt="Crayons Bridge" width="190" style="max-width:190px;height:auto">
  <h2>Reset your Crayons Bridge password</h2>
  <p>Use the secure link below to choose a new password.</p>
  <p><a href="{{ .ConfirmationURL }}">Reset password</a></p>
  <p>If you did not request this, ignore this email.</p>
  <p>Crayons Bridge · StreamVista OPC Pvt Ltd</p>
</div>

## Password changed notification subject
Your Crayons Bridge password was changed

## Password changed notification HTML
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
  <img src="https://bridge.crayonspictures.com/brand/logo.png" alt="Crayons Bridge" width="190" style="max-width:190px;height:auto">
  <h2>Password changed</h2>
  <p>The password for your Crayons Bridge account was changed.</p>
  <p>If this was not you, reset your password immediately and contact support.</p>
  <p>Crayons Bridge · StreamVista OPC Pvt Ltd</p>
</div>

Also customize invite, magic link, email change, reauthentication, MFA factor enrolled/unenrolled, and identity linked/unlinked using the same brand header/footer. Never use "Supabase Auth" in the visible subject, sender name, or body.
