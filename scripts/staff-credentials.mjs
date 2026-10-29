import { initializeStaffCredentials, recoverDeveloperCredential, checkRecoveredCredential } from '../dist/back-office/credential-maintenance.js';
import { OwnerRecoveryService } from '../dist/back-office/owner-recovery.js';
import { parsePlatformOperators } from '../dist/back-office/operators.js';

const usage = `Protected server administrator command. Never pass credentials on the command line.
  staff:credentials -- init --file /private/staff-operators.json
    Initializes from CREDITS_PLATFORM_OPERATORS; refuses to overwrite a file.
  staff:credentials -- recover --file /private/staff-operators.json --operator company-owner --output /separate-private/new-credential.json --reason "INC-123 owner recovery"
    Rotates an existing developer credential; preserves ID, role and app scopes.
  staff:credentials -- stage-owner-email --file /private/staff-operators.json --operator company-owner
    Stages CREDITS_OWNER_RECOVERY_EMAIL using private CREDITS_OWNER_RECOVERY_SECRET.
    Requires authenticated mailbox verification and saved offline code before activation.
  staff:credentials -- check --file /private/staff-operators.json --receipt /separate-private/new-credential.json
    Checks whether a recovery receipt is current, without printing its secret.
Directories must exist, belong to this OS user, and have mode0700. Files use0600.
Recovery relies on independently secured server/secret-manager access. No email
or MFA bypass is added. Audit events must be exported to monitored logs online.`;
try {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help') { console.log(usage); }
  else {
    const options = new Map();
    const allowed = new Set(command === 'init' ? ['--file'] : command === 'recover' ? ['--file', '--operator', '--output', '--reason'] : command === 'stage-owner-email' ? ['--file','--operator'] : command === 'check' ? ['--file', '--receipt'] : []);
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i], value = args[i + 1];
      if (!allowed.has(key) || !value || value.startsWith('--') || options.has(key)) throw new Error('Invalid command options; use --help');
      options.set(key, value);
    }
    if (options.size !== allowed.size || !allowed.size) throw new Error('Missing or invalid command options; use --help');
    const file = options.get('--file');
    if (command === 'init') {
      await initializeStaffCredentials(file, parsePlatformOperators(process.env.CREDITS_PLATFORM_OPERATORS ?? '[]'));
      console.log('Private staff credential file initialized. Configure CREDITS_PLATFORM_OPERATORS_FILE with its absolute path.');
    } else if (command === 'stage-owner-email') {
      const service = new OwnerRecoveryService(file, process.env.CREDITS_OWNER_RECOVERY_SECRET ?? '');
      await service.stage(options.get('--operator'), process.env.CREDITS_OWNER_RECOVERY_EMAIL ?? '');
      console.log('Recovery address staged privately. Mailbox verification and an offline recovery code are required before activation. No email was sent.');
    } else if (command === 'recover') {
      const result = await recoverDeveloperCredential(file, options.get('--operator'), options.get('--output'), options.get('--reason'));
      console.log(JSON.stringify({ status: 'rotated', ...result, next: 'Import the private credential into your password manager. Monitor and review the recorded recovery event. No secret was printed.' }));
    } else {
      const current = await checkRecoveredCredential(file, options.get('--receipt'));
      console.log(current ? 'CURRENT: private receipt matches the active developer credential.' : 'NOT CURRENT: receipt does not match the active developer credential.');
      if (!current) process.exitCode = 1;
    }
  }
} catch {
  // Errors may carry filesystem/config content; never echo raw exceptions.
  console.error('Staff credential operation failed. Check private paths/permissions, account ID, audit log and any lock. If interrupted, use check to determine whether the saved receipt is current. No credential was printed.');
  process.exitCode = 1;
}
