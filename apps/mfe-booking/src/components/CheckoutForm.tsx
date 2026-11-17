import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { createOrderSchema, paymentScenarioSchema } from '@plateia/contracts';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { NAMESPACE } from '../i18n';

// Built from the API contract: the browser and the server validate with the
// very same rules, so they cannot drift apart.
const customerShape = createOrderSchema.shape.customer.shape;
const checkoutSchema = z.object({
  name: customerShape.name,
  email: customerShape.email,
  paymentScenario: paymentScenarioSchema,
});

export type CheckoutValues = z.infer<typeof checkoutSchema>;

interface CheckoutFormProps {
  totalLabel: string;
  submitting: boolean;
  onSubmit: (values: CheckoutValues) => void;
}

export function CheckoutForm({ totalLabel, submitting, onSubmit }: CheckoutFormProps) {
  const { t } = useTranslation(NAMESPACE);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CheckoutValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { name: '', email: '', paymentScenario: 'approve' },
    mode: 'onTouched',
  });

  return (
    <Stack component="form" noValidate spacing={2} onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
      <TextField
        {...register('name')}
        label={t('checkout.name')}
        autoComplete="name"
        required
        fullWidth
        error={Boolean(errors.name)}
        helperText={errors.name ? t('checkout.nameError') : undefined}
      />
      <TextField
        {...register('email')}
        label={t('checkout.email')}
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        fullWidth
        error={Boolean(errors.email)}
        helperText={errors.email ? t('checkout.emailError') : t('checkout.privacy')}
      />

      <FormControl>
        <FormLabel id="payment-scenario-label">{t('checkout.scenario')}</FormLabel>
        <Controller
          control={control}
          name="paymentScenario"
          render={({ field }) => (
            <RadioGroup {...field} aria-labelledby="payment-scenario-label" aria-describedby="payment-scenario-hint">
              <FormControlLabel value="approve" control={<Radio />} label={t('checkout.approve')} />
              <FormControlLabel value="decline" control={<Radio />} label={t('checkout.decline')} />
            </RadioGroup>
          )}
        />
        <FormHelperText id="payment-scenario-hint" sx={{ mx: 0 }}>
          {t('checkout.scenarioHint')}
        </FormHelperText>
      </FormControl>

      <Button type="submit" variant="contained" size="large" fullWidth loading={submitting}>
        <Typography component="span" sx={{ fontWeight: 650 }}>
          {submitting ? t('checkout.paying') : t('checkout.pay', { total: totalLabel })}
        </Typography>
      </Button>
    </Stack>
  );
}
