import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { Content } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const demoFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  role: z.string().min(1, "Please select a role"),
})

type DemoFormValues = z.infer<typeof demoFormSchema>

export function DemoPage() {
  const form = useForm<DemoFormValues>({
    resolver: zodResolver(demoFormSchema),
    defaultValues: { name: "", email: "", role: "" },
  })

  const onSubmit = (data: DemoFormValues) => {
    console.log(data)
    alert(`Submitted: ${JSON.stringify(data, null, 2)}`)
  }

  return (
    <Content className="space-y-16 pb-16">
      {/* Hero */}
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Component Demo
        </h1>
        <p className="mx-auto max-w-xl text-muted-foreground">
          Explore UI components built with shadcn/ui, Tailwind CSS, and React.
        </p>
      </div>

      {/* Input */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 space-y-1">
          <h2 className="text-lg font-semibold">Input</h2>
          <p className="text-sm text-muted-foreground">
            Text fields with various states.
          </p>
        </div>
        <div className="flex max-w-md flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Default</label>
            <Input placeholder="Enter text..." />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Email</label>
            <Input type="email" placeholder="you@example.com" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Disabled</label>
            <Input placeholder="Disabled" disabled />
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 space-y-1">
          <h2 className="text-lg font-semibold">Form with validation</h2>
          <p className="text-sm text-muted-foreground">
            Example form with Zod schema validation.
          </p>
        </div>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="mx-auto max-w-md space-y-5"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Your name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="developer">Developer</SelectItem>
                      <SelectItem value="designer">Designer</SelectItem>
                      <SelectItem value="pm">Product Manager</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-3 pt-2">
              <Button type="submit">Submit</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => form.reset()}
              >
                Reset
              </Button>
            </div>
          </form>
        </Form>
      </section>
    </Content>
  )
}
