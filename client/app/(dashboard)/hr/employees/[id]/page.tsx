import { EmployeeDetailPage } from "@/components/profile/employee-detail-page"

export default async function Page({ params }: PageProps<"/hr/employees/[id]">) {
  const { id } = await params
  return <EmployeeDetailPage employeeId={id} backHref="/hr/employees" />
}
