import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, AlertTitle, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { loginRequestSchema, type LoginRequest } from '@plateia/contracts';
import { isApiError } from '@plateia/web-kit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { login, meKey } from '../api';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, NAMESPACE } from '../i18n';

export function LoginView() {
  const { t } = useTranslation(NAMESPACE);
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginRequest>({ resolver: zodResolver(loginRequestSchema), defaultValues: { email: '', password: '' } });

  const signIn = useMutation({
    mutationFn: login,
    onSuccess: (organizer) => queryClient.setQueryData(meKey, organizer),
  });

  const errorMessage = signIn.error
    ? isApiError(signIn.error, 'INVALID_CREDENTIALS')
      ? t('login.invalid')
      : isApiError(signIn.error, 'RATE_LIMITED')
        ? t('login.tooMany')
        : t('login.error')
    : null;

  return (
    <Box sx={{ display: 'grid', placeItems: 'center', py: { xs: 4, md: 8 } }}>
      <Paper variant="outlined" sx={{ p: { xs: 3, md: 4 }, width: '100%', maxWidth: 440 }}>
        <Stack spacing={2.5}>
          <Stack spacing={0.5}>
            <Typography variant="overline" color="primary">
              {t('login.eyebrow')}
            </Typography>
            <Typography variant="h1" sx={{ fontSize: '1.75rem' }}>
              {t('login.title')}
            </Typography>
          </Stack>

          <Box aria-live="polite">{errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}</Box>

          <Stack
            component="form"
            noValidate
            spacing={2}
            onSubmit={(event) => void handleSubmit((values) => signIn.mutate(values))(event)}
          >
            <TextField
              {...register('email')}
              label={t('login.email')}
              type="email"
              autoComplete="username"
              required
              fullWidth
              error={Boolean(errors.email)}
            />
            <TextField
              {...register('password')}
              label={t('login.password')}
              type="password"
              autoComplete="current-password"
              required
              fullWidth
              error={Boolean(errors.password)}
            />
            <Button type="submit" variant="contained" size="large" loading={signIn.isPending}>
              {signIn.isPending ? t('login.submitting') : t('login.submit')}
            </Button>
          </Stack>

          <Alert severity="info" variant="outlined">
            <AlertTitle>{t('login.demoTitle')}</AlertTitle>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {DEMO_ACCOUNTS.map((account) => (
                <li key={account.email}>
                  <strong>{account.email}</strong> · {account.company}
                </li>
              ))}
            </Box>
            <Typography variant="body2" sx={{ mt: 1 }}>
              {t('login.demoBody', { password: DEMO_PASSWORD })}
            </Typography>
          </Alert>
        </Stack>
      </Paper>
    </Box>
  );
}
