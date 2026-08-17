import React from "react";
import type { Metadata } from "next";
import { Table, type TableData } from "@/components/ui/table";
import Sidebar from "@/components/ui/sidebar";
import durations from "@/data/courseDurations.json";
import requirements from "@/data/programRequirements.json";
import courses from "@/data/courses.json";

export const metadata: Metadata = {
  title: "CS Guide",
  description:
    "An open-source guide to course registration, program requirements, resources and opportunities for Computer Science students at Brock University.",
};

const Guide: React.FC = () => {
  return (
    <main className="min-h-screen py-10 sm:py-16">
      <div className="max-w-6xl mx-auto flex gap-16 px-1 sm:px-6">
        {/* LEFT SIDEBAR */}
        <Sidebar />

        {/* MAIN CONTENT */}
        <div className="animate-fade-in flex-1 max-w-full md:max-w-3xl">
          {/* HERO */}
          <section id="introduction" className="mb-16">
            <h1 className="text-3xl sm:text-4xl font-bold mb-6">
              Brock CS Student Guide
            </h1>

            <Prose>
              <p>
                Hello there, We are thrilled to have you here! Whether
                you&apos;re new or returning, our mission is to empower students
                with the skills, knowledge, and connections necessary to excel
                in Computer Science (CS) and enhance their university
                experience. We achieve this through workshops on trending
                technologies, community-building activities, and opportunities
                to apply your knowledge in real-world scenarios.
              </p>
              <p>
                This guide is designed to help you successfully navigate the CS
                seas as a student at Brock University.
              </p>
              <p>
                Throughout the guide, we will review everything you need to know
                about the Computer Science Program. This is an open-source guide
                for Computer Science students at Brock University. We encourage
                and appreciate everyone’s contributions to its continuous growth
                and development.
              </p>
            </Prose>
          </section>

          {/* COURSE REGISTRATION */}
          <section id="registration" className="mb-12">
            <h1 className="text-3xl sm:text-4xl font-bold mb-6">
              Course Registration
            </h1>

            <Prose>
              <p>
                As a first-year student, one of your first tasks is to register
                for your courses. This section is here to guide you through that
                process.
              </p>
              <p>
                Start by checking the course requirements in the{" "}
                <a className={linkStyle} href="https://calendar.brocku.ca/">
                  undergraduate calendar
                </a>
                . Familiarise yourself with the page, including program notes
                and hyperlinks, to get comfortable with the layout and
                information.
              </p>
            </Prose>
          </section>

          {/* COURSE CODES  */}
          <section id="course-codes" className="mb-20">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
              <span className="w-4 h-4 shrink-0 rounded-full border-2 border-brand" />
              Course Codes
            </h2>

            <Prose className="mb-8">
              <p>
                In your course requirements, you will see a bunch of course
                codes and it is crucial to know how these courses are
                structured.
              </p>
              <p>
                For Example: The COSC 1P02 course code can be broken down as,
              </p>
            </Prose>

            <div className="space-y-4">
              <CourseRow
                code="COSC"
                title="The department which is offering the course."
              />
              <CourseRow
                code="1"
                title="Indicates the year the course is intended for."
              />
              <CourseRow
                code="P"
                title="Represents the number of credits you get for completing the course."
              />
              <CourseRow
                code="02"
                title="Department code for the specific course."
              />
            </div>
          </section>

          {/* CREDIT BREAKDOWN */}
          <section id="common-course-types" className="mb-20">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
              <span className="w-4 h-4 shrink-0 rounded-full border-2 border-brand" />
              Common Course Types
            </h2>

            <div className="grid md:grid-cols-2 gap-8">
              {/* FULL CREDIT */}
              <div className="relative bg-surface border-2 border-line rounded-2xl p-6 sm:p-8 shadow-[4px_4px_0_var(--shade)]">
                <div className="absolute -top-4 left-6 bg-surface border-2 border-line px-3 py-1 rounded-full shadow-brut-sm font-semibold">
                  F
                </div>

                <h3 className="text-xl font-semibold mb-4 mt-4">
                  Full-Credit Course
                </h3>

                <p className="text-subtle">
                  Full-credit courses run through both Fall and Winter semesters
                  (D1 duration). Some intensive thesis or project courses are
                  weighted as 1.0 credits.
                </p>
              </div>

              {/* HALF CREDIT */}
              <div className="relative bg-surface border-2 border-line rounded-2xl p-6 sm:p-8 shadow-[4px_4px_0_var(--shade)]">
                <div className="absolute -top-4 left-6 bg-brand text-brand-ink border-2 border-line px-3 py-1 rounded-full shadow-brut-sm font-semibold">
                  P/Q
                </div>

                <h3 className="text-xl font-semibold mb-4 mt-4">
                  Half-Credit Course
                </h3>

                <p className="text-subtle">
                  Most courses at Brock are 0.5 credits. These typically run for
                  one semester (12 weeks). You need 20.0 credits total to
                  graduate with an Honours degree.Q is the same thing, it is
                  used for cross-listed courses.
                </p>
              </div>

              {/* COOP CREDIT */}
              <div className="relative bg-surface border-2 border-line rounded-2xl p-6 sm:p-8 shadow-[4px_4px_0_var(--shade)]">
                <div className="absolute -top-4 left-6 bg-brand text-brand-ink border-2 border-line px-3 py-1 rounded-full shadow-brut-sm font-semibold">
                  C
                </div>

                <h3 className="text-xl font-semibold mb-4 mt-4">
                  Coop-Credit Course
                </h3>

                <p className="text-subtle">
                  Only required for co-op, and the credit is only weighted for
                  OSAP but does not apply to your graduation requirement
                </p>
              </div>
              {/* COOP CREDIT */}
              <div className="relative bg-surface border-2 border-line rounded-2xl p-6 sm:p-8 shadow-[4px_4px_0_var(--shade)]">
                <div className="absolute -top-4 left-6 bg-brand text-brand-ink border-2 border-line px-3 py-1 rounded-full shadow-brut-sm font-semibold">
                  N
                </div>

                <h3 className="text-xl font-semibold mb-4 mt-4">
                  No-Credit Course
                </h3>

                <p className="text-subtle">Only required for co-op</p>
              </div>
            </div>
            <div className="mt-6">
              <Callout>
                ⚠ Note: Every Major program requires 20 credits to graduate.
              </Callout>
            </div>
          </section>

          {/* Course Durations*/}
          <section id="course-duration" className="mb-20">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
              <span className="w-4 h-4 shrink-0 rounded-full border-2 border-brand" />
              Course Durations
            </h2>
            <Prose className="mb-8">
              <p>
                Courses are offered during various times throughout the year and
                it is important to know which duration refers to which time
                period.
              </p>
            </Prose>
            <Table data={durations as TableData} mobileVariant="stack" />
          </section>

          {/* Sections*/}
          <section id="course-sections" className="mb-8">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
              <span className="w-4 h-4 shrink-0 rounded-full border-2 border-brand" />
              Sections
            </h2>
            <Prose className="mb-8">
              <p>
                Some courses are large and divided into sections for lectures,
                seminars, labs, or marking purposes. Sections might have
                different instructors but cover the same material. If you want
                to be in the same class as a friend, make sure to enrol in the
                same section.
              </p>
            </Prose>
          </section>

          {/* Context Credits*/}
          <section id="context-credits" className="mb-20">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
              <span className="w-4 h-4 shrink-0 rounded-full border-2 border-brand" />
              Context Credits
            </h2>
            <Prose className="mb-8">
              <p>
                All students must include one credit (or two half-credits) from
                the list of Humanities, Social Sciences and Sciences Context
                Courses to fulfil their degree requirements.{" "}
                <a
                  className={linkStyle}
                  href="https://brocku.ca/webcal/current/undergrad/areg.html#sec29"
                >
                  Context Courses
                </a>{" "}
                are mandatory courses intended to provide you with a broad
                educational background. For Computer Science students, the
                science context credit is covered by the program requirements,
                so since you are here you&apos;ll most likely need to focus on
                Humanities and Social Sciences context credits.
              </p>
              <p>
                Students in four-year Honours professional programs must fulfil
                context requirements by the end of the third year of the
                program. All other students must have completed all three
                required context courses within the first 10 credits. You can
                find the list of context credits{" "}
                <a
                  className={linkStyle}
                  href="https://brocku.ca/webcal/current/undergrad/areg.html#sec29"
                >
                  here
                </a>
                .
              </p>
              <Callout>
                ⚠ Note: This should be cross referenced with the{" "}
                <a
                  className={linkStyle}
                  href="https://brocku.ca/guides-and-timetables/timetables/?session=fw&type=ug&level=all"
                >
                  undergraduate timetable
                </a>
                , as sometimes the courses listed here are not always offered.
              </Callout>
              <p>
                You can use the Course Planning Tool in your my.brocku.ca
                student portal to check out all the courses that satisfy a
                particular context credit and check whether there’s space
                available, it’s waitlisted or it’s full.
              </p>
              <Callout tone="tip">
                ⚠ Tip: When selecting a context credit, make sure to read the
                course description and see that you are interested in the
                course. We understand that sometimes you just want to learn
                about your major but they are intended to provide you with a
                broad educational background. Sometimes, it can get frustrating
                trying to find a context credit that fits your schedule but we
                highly recommend spending time on this decision. An extra 15
                minutes on this can drastically change your overall experience
                for the next semester or even the entire academic year. (In
                Jay’s opinion, most of the time there’s no point in taking a
                bird course, it’s a waste of time and money.)
              </Callout>
            </Prose>
          </section>

          {/* Program Requirements*/}
          <section id="requirements" className="mb-20">
            <h1 className="text-3xl sm:text-4xl font-bold mb-6">
              Program Requirements
            </h1>

            <section id="bachelor">
              <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
                <span className="w-4 h-4 shrink-0 rounded-full border-2 border-brand" />
                Credit Requirements for Bachelor of Science, Computer Science
              </h2>

              <Table data={requirements as TableData} mobileVariant="scroll" />

              <div className="mt-6 mb-8">
                <Callout>
                  ⚠ Note: These requirements are subject to change. If
                  you&apos;re in a specialized major then this could be
                  different for you. Use this chart in tandem with the{" "}
                  <a className={linkStyle} href="https://calendar.brocku.ca/">
                    course calendar
                  </a>{" "}
                  to achieve your degree requirements.
                </Callout>
              </div>
            </section>
          </section>

          {/* Minor in Applied Computing*/}
          <section id="minor-computing" className="mb-8">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
              <span className="w-4 h-4 shrink-0 rounded-full border-2 border-brand" />
              Minor in Applied Computing
            </h2>
            <Prose className="mb-8">
              <Callout>
                ⚠ Note: This is the only minor that the CS Department offers.
              </Callout>
              <p>
                Students in other disciplines may obtain a minor in Applied
                Computing within their degree program by completing the
                following courses with a minimum 60 percent overall average:
              </p>
              <p>Four APCO and/or COSC credits.</p>
              <p>
                The applied computing minor is not available to Computer Science
                students of any kind, and APCO classes are only available to
                COSC students if they are cross listed as COSC classes, e.g.
                APCO 2P89 Internet Technologies is also COSC 2P89.
              </p>
            </Prose>
          </section>

          {/* Double Major*/}
          <section id="double-major" className="mb-8">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
              <span className="w-4 h-4 shrink-0 rounded-full border-2 border-brand" />
              Double Major
            </h2>

            <Prose className="mb-8">
              <p>
                Consider a double major program as this might allow you to have
                more direction in your non-core computer science courses, and it
                may serve the advantage of allowing you to bypass courses such
                as MATH1P06 and COSC4P61, and of course add more qualifications
                to your resume. A popular pathway is the Computing and Business
                degree, however you can pair computer science with most programs
                in sciences, humanities, social sciences, and arts.
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <a
                    className={linkStyle}
                    href="https://calendar.brocku.ca/preview_program.php?catoid=23&poid=10350"
                  >
                    Double Major info
                  </a>
                </li>
                <li>
                  <a
                    className={linkStyle}
                    href="https://brocku.ca/programs/undergraduate/computing-and-business/"
                  >
                    Computing and Business
                  </a>
                </li>
              </ul>
            </Prose>
          </section>

          {/* Courses*/}
          <section id="courses" className="mb-20">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
              <span className="w-4 h-4 shrink-0 rounded-full border-2 border-brand" />
              Courses
            </h2>

            <Prose className="mb-8">
              <p>
                This is a list of all required COSC courses, their prerequisites
                and the terms that they are generally offered in.
              </p>
            </Prose>
            <div className="mt-6 mb-8">
              <Callout>
                <div className="space-y-3">
                  <p>
                    ⚠ Note: Do not rely on this alone, For the most up-to-date
                    information, consult:
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>
                      <a
                        className={linkStyle}
                        href="https://brocku.ca/guides-and-timetables/timetables/?session=fw&type=ug&level=all"
                      >
                        BrockU Time table
                      </a>
                    </li>
                    <li>
                      <a
                        className={linkStyle}
                        href="https://brocku.ca/webcal/current/undergrad/cosc.html"
                      >
                        Course Calendar
                      </a>
                    </li>
                  </ul>
                  <p>
                    Not all classes are listed here, just classes that are
                    required for the completion of Bsc with a major in Computer
                    Science, e.g. a class that hasn&apos;t been offered in more
                    than two years won&apos;t be here
                  </p>
                </div>
              </Callout>
            </div>

            <Table data={courses as TableData} mobileVariant="stack" />

            <Prose className="mb-8 mt-8">
              <p>Here are some other helpful links,</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <a
                    className={linkStyle}
                    href="https://brocku.ca/webcal/current/undergrad/cosc.html"
                  >
                    List of different degrees and specializations in Computer
                    Science with their course requirements.
                  </a>
                </li>
                <li>
                  <a
                    className={linkStyle}
                    href="https://brocku.ca/mathematics-science/computer-science/"
                  >
                    Computer Science Department website.
                  </a>
                </li>
              </ul>
            </Prose>
          </section>

          {/* ADDITIONAL RESOURCES AND OPPORTUNITIES (PARENT INTRO ONLY) */}
          <section id="resources-opportunities" className="mb-16">
            <h1 className="text-3xl sm:text-4xl font-bold mb-6">
              Additional Resources and Opportunities
            </h1>
          </section>

          {/* RESOURCES */}
          <section id="resources" className="mb-10">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
              <span className="w-4 h-4 shrink-0 rounded-full border-2 border-brand" />
              Resources
            </h2>

            <Prose className="mb-8">
              <div>
                <h3 className="font-semibold text-ink mb-2">
                  Computer Science Club
                </h3>
                <p>
                  A great place to start and get a student&apos;s perspective on
                  things and to stay up to date about the latest opportunities
                  is by keeping in touch with the Computer Science Club. Make
                  sure to follow us on{" "}
                  <a
                    className={linkStyle}
                    href="https://www.instagram.com/brockcsc/"
                  >
                    Instagram
                  </a>{" "}
                  and join our{" "}
                  <a className={linkStyle} href="https://discord.gg/a8nWyZAY9T">
                    Discord
                  </a>{" "}
                  to stay connected.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-ink mb-2">
                  Computer Science Help Desk
                </h3>
                <p>
                  The Computer Science Department hosts a Help Desk in MCJ 328.
                  This allows you to receive one-on-one support for any Computer
                  Science course-related questions. The Help Desk schedule can
                  be found{" "}
                  <a
                    className={linkStyle}
                    href="http://brocku.ca/mathematics-science/computer-science/helpdesk_schedule/"
                  >
                    here
                  </a>
                  .
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-ink mb-2">
                  Learning Services
                </h3>
                <p>
                  Learning Services increases academic success and retention of
                  all students at Brock University. Check them out{" "}
                  <a
                    className={linkStyle}
                    href="https://brocku.ca/student-life-success/learning-services/"
                  >
                    here
                  </a>
                  .
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-ink mb-2">Professors</h3>
                <p>
                  One of the most underrated resources. Don’t hesitate to reach
                  out, attend office hours, and ask questions.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-ink mb-2">Goodies</h3>
                <p className="mb-2">
                  Many free trials and tools are available to you as a CS
                  student:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    <a
                      className={linkStyle}
                      href="https://brocku.ca/information-technology/office-365-log-in/"
                    >
                      Office 365
                    </a>{" "}
                    - Free access + 5TB OneDrive
                  </li>
                  <li>
                    <a
                      className={linkStyle}
                      href="https://education.github.com/pack"
                    >
                      GitHub Student Developer Pack
                    </a>
                  </li>
                  <li>
                    <a
                      className={linkStyle}
                      href="https://www.linkedin.com/learning/"
                    >
                      LinkedIn Learning
                    </a>
                  </li>
                  <li>
                    <a
                      className={linkStyle}
                      href="https://www.studentappcentre.com/App/1Password"
                    >
                      1Password Trial
                    </a>
                  </li>
                  <li>
                    <a
                      className={linkStyle}
                      href="https://www.amazon.ca/amazonprime?primeCampaignId=studentWlpPrimeRedir"
                    >
                      Amazon Prime Student
                    </a>
                  </li>
                  <li>
                    <a
                      className={linkStyle}
                      href="https://www.figma.com/education/"
                    >
                      Figma
                    </a>
                  </li>
                  <li>
                    <a
                      className={linkStyle}
                      href="https://www.spotify.com/ca-en/student/"
                    >
                      Spotify Student
                    </a>
                  </li>
                  <li>Local student discounts (e.g., Rogers Wireless)</li>
                </ul>
              </div>
            </Prose>
          </section>

          {/* OPPORTUNITIES */}
          <section id="opportunities" className="mb-16">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
              <span className="w-4 h-4 shrink-0 rounded-full border-2 border-brand" />
              Opportunities
            </h2>

            <Prose className="mb-8">
              <div>
                <h3 className="font-semibold text-ink mb-2">Experience BU</h3>
                <p>
                  Find events, volunteering, and workshops.{" "}
                  <a
                    className={linkStyle}
                    href="https://experiencebu.brocku.ca/"
                  >
                    Check it out here
                  </a>
                  .
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-ink mb-2">CareerZone</h3>
                <p>
                  Apply for on-campus jobs and build transferable skills.{" "}
                  <a
                    className={linkStyle}
                    href="https://careerzone.brocku.ca/myAccount/dashboard.htm"
                  >
                    Visit CareerZone
                  </a>
                  .
                </p>
              </div>
              <Callout tone="tip">
                ⚠ Quick Tip: Most job postings for next year appear in
                January/February. Also check{" "}
                <a
                  className={linkStyle}
                  href="https://brocku.wd3.myworkdayjobs.com/brocku_careers"
                >
                  Workday
                </a>{" "}
                for TA roles and other listings.
              </Callout>
            </Prose>
          </section>
        </div>
      </div>
    </main>
  );
};

export default Guide;

/* ---------- LAYOUT HELPERS ---------- */

function Prose({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`border-l-4 border-brand pl-4 sm:pl-6 text-subtle text-lg space-y-4 ${className}`}
    >
      {children}
    </div>
  );
}

function Callout({
  tone = "warning",
  children,
}: {
  tone?: "warning" | "tip";
  children: React.ReactNode;
}) {
  const tones = {
    warning:
      "border-yellow-400 bg-yellow-50 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-100",
    tip: "border-blue-400 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100",
  };
  return (
    <div
      className={`border rounded-xl px-4 py-4 text-sm sm:px-6 ${tones[tone]}`}
    >
      {children}
    </div>
  );
}

const linkStyle = "underline text-brand hover:decoration-2";

/* ---------- SMALL COURSE ROW COMPONENT ---------- */

type CourseRowProps = {
  code: string;
  title: string;
};

function CourseRow({ code, title }: CourseRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 bg-surface border-2 border-line rounded-xl px-4 py-4 shadow-brut-sm sm:px-6">
      <div className="flex items-center gap-4">
        <div className="border-line bg-brand border-1 text-brand-ink text-xs font-bold px-3 py-1 rounded-md shrink-0">
          {code}
        </div>
        <span className="font-medium">{title}</span>
      </div>
    </div>
  );
}
