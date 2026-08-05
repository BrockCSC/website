import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { ExecRecord, WithKey, createExec, updateExec } from "@/lib/api";
import { useState } from "react";

type TeamMember = WithKey<ExecRecord>;

export default function ExecModal({
  showModal,
  setShowModal,
  selectedExec,
  onSave,
}: {
  showModal: boolean;
  setShowModal: (value: boolean) => void;
  selectedExec: TeamMember | null;
  onSave: () => void;
}) {
  const [name, setName] = useState(selectedExec?.name ?? "");
  const [description, setDescription] = useState(
    selectedExec?.description ?? "",
  );
  const [title, setTitle] = useState(selectedExec?.title ?? "Select Role");
  const [isPast, setIsPast] = useState(
    selectedExec ? !(selectedExec.isCurrentExec ?? true) : false,
  );
  const [term, setTerm] = useState(selectedExec?.term ?? "");
  const [github, setGithub] = useState(selectedExec?.socials?.github ?? "");
  const [linkedin, setLinkedin] = useState(
    selectedExec?.socials?.linkedin ?? "",
  );
  const [instagram, setInstagram] = useState(
    selectedExec?.socials?.instagram ?? "",
  );
  const [twitter, setTwitter] = useState(selectedExec?.socials?.x ?? "");
  const [photoUrl, setPhotoUrl] = useState(selectedExec?.image?.url ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    try {
      const execData: ExecRecord = {
        name,
        description,
        title,
        isCurrentExec: !isPast,
        term: isPast ? term : "",
        image: { url: photoUrl },
        socials: { github, linkedin, instagram, x: twitter },
      };

      if (selectedExec && selectedExec.$key) {
        await updateExec(selectedExec.$key, execData);
      } else {
        await createExec(execData);
      }
      onSave();
      setShowModal(false);
    } catch (error) {
      console.error("Failed to save exec:", error);
      setSaveError(
        "Couldn't save this executive. Please try again in a moment.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open={showModal}
      onClose={() => setShowModal(false)}
      title={selectedExec ? "Edit Executive" : "Add Executive"}
    >
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">Full Name</label>
          <input
            type="text"
            required
            className="w-full rounded border px-3 py-2"
            placeholder="John Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">
            Description
          </label>
          <textarea
            className="w-full rounded border px-3 py-2"
            placeholder="A short bio for this executive..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex w-full mb-4">
          <div className="flex flex-col w-full">
            <label className="block items-center text-sm font-semibold mb-1 flex gap-4">
              Role / Title
              <div className="flex items-center mb-4 w-1/2 justify-start mt-4">
                <input
                  type="checkbox"
                  id="simple-checkbox"
                  className="h-4 w-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 accent-blue-600"
                  checked={isPast}
                  onChange={(e) => setIsPast(e.target.checked)}
                />
                <label className="ml-2 text-sm font-medium text-gray-900">
                  Past Executive
                </label>
              </div>
            </label>
            <select
              className="rounded border px-3 py-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            >
              <option value="Select Role">Select Role</option>
              <option value="President">President</option>
              <option value="Vice President">Vice President</option>
              <option value="Co-President">Co-President</option>
              <option value="Treasurer">Treasurer</option>
              <option value="Executive">Executive</option>
            </select>
          </div>
        </div>
        {isPast && (
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-1">
              Term (e.g. 2016-2017)
            </label>
            <input
              type="text"
              className="w-full rounded border px-3 py-2"
              placeholder="2016-2017"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>
        )}
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">Github URL</label>
          <input
            type="text"
            className="w-full rounded border px-3 py-2"
            placeholder="https://github.com/username"
            value={github}
            onChange={(e) => setGithub(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">LinkedIn</label>
          <input
            type="url"
            className="w-full rounded border px-3 py-2"
            placeholder="https://www.linkedin.com/in/username"
            value={linkedin}
            onChange={(e) => setLinkedin(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">Instagram</label>
          <input
            type="url"
            className="w-full rounded border px-3 py-2"
            placeholder="https://www.instagram.com/username"
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">X URL</label>
          <input
            type="url"
            className="w-full rounded border px-3 py-2"
            placeholder="https://twitter.com/username"
            value={twitter}
            onChange={(e) => setTwitter(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">
            Profile Photo URL
          </label>
          <input
            type="url"
            className="w-full rounded border px-3 py-2"
            placeholder="https://example.com/photo.png"
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
          />
        </div>
        {saveError && (
          <p className="mb-4 text-sm font-semibold text-red-600">{saveError}</p>
        )}
        <div className="flex gap-4">
          <Button variant="primary" type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Executive Member"}
          </Button>
          <Button
            variant="secondary"
            type="button"
            onClick={() => setShowModal(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
