import { useFormContext } from "react-hook-form"
import { type ChangeEvent, type ReactNode } from "react"
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { CurrencyFormatter } from "@/lib/currency-formater"

interface NumberFieldProps {
  label: string
  name: string
  disabled?: boolean
  placeholder: string
  autoComplete?: string
  require?: boolean
  endIcon?: ReactNode
  startIcon?: ReactNode
  currencyVnd?: boolean
}

export const NumberField = (props: NumberFieldProps) => {
  const {
    name,
    label,
    disabled = false,
    placeholder,
    autoComplete = "off",
    require = false,
    endIcon,
    startIcon,
    currencyVnd = false,
  } = props

  const { control } = useFormContext()

  const handleChange = (
    event: ChangeEvent<HTMLInputElement>,
    onChange: (value: number | null) => void
  ) => {
    let value: string | number = event.target.value

    if (currencyVnd) {
      value = CurrencyFormatter.toNumber(value)
    }

    onChange(value === "" ? null : Number(value))
  }

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="space-y-1">
          <FormLabel className="relative">
            {label}
            {require && (
              <span className="text-xl absolute top-[-5px] right-[-10px] text-[red]">
                {" "}
                *
              </span>
            )}
          </FormLabel>
          <FormControl>
            <Input
              {...field}
              endIcon={endIcon}
              startIcon={startIcon}
              type="number"
              placeholder={placeholder}
              autoComplete={autoComplete}
              disabled={disabled}
              value={field.value ?? ""}
              onChange={(e) => handleChange(e, field.onChange)}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
