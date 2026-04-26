// src/hooks/useDialog.tsx
import React, {
    createContext,
    useCallback,
    useContext,
    useState,
    type ReactNode,
} from "react";

type DialogItem = {
    id: string;
    node: ReactNode;
};

type DialogContextValue = {
    push: (item: DialogItem) => void;
    pop: (id: string) => void;
};

const DialogContext = createContext<DialogContextValue | null>(null);

export const DialogProvider: React.FC<{ children: ReactNode }> = ({
    children,
}) => {
    const [stack, setStack] = useState<DialogItem[]>([]);

    const push = useCallback((item: DialogItem) => {
        setStack((prev) => [...prev, item]);
    }, []);

    const pop = useCallback((id: string) => {
        setStack((prev) => prev.filter((d) => d.id !== id));
    }, []);

    return (
        <DialogContext.Provider value={{ push, pop }}>
            {children}

            {/* 一番上だけ表示するスタック方式 */}
            {stack.length > 0 && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4">
                    <div className="flex min-h-full items-center justify-center">
                        {stack[stack.length - 1]?.node}
                    </div>
                </div>
            )}
        </DialogContext.Provider>
    );
};

function useDialogCore(): DialogContextValue {
    const ctx = useContext(DialogContext);
    if (!ctx) {
        throw new Error("useDialog must be used within <DialogProvider />");
    }
    return ctx;
}

// ----------------------
// 汎用テキスト入力ダイアログ
// ----------------------

type TextInputDialogOptions = {
    title?: string;
    label?: string;
    placeholder?: string;
    type?: "text" | "password";
    okText?: string;
    cancelText?: string;
    validate?: (value: string) => string | null;
};

const TextInputDialog: React.FC<{
    options: TextInputDialogOptions;
    onSubmit: (value: string) => void;
    onCancel: () => void;
}> = ({ options, onSubmit, onCancel }) => {
    const [value, setValue] = React.useState("");
    const [error, setError] = React.useState<string | null>(null);

    const handleOk = () => {
        if (options.validate) {
            const msg = options.validate(value);
            if (msg) {
                setError(msg);
                return;
            }
        }
        onSubmit(value);
    };

    const handleCancel = () => onCancel();

    return (
        <div className="w-full max-w-sm rounded-2xl bg-slate-900 p-6 shadow-xl border border-slate-700 text-white">
            <h2 className="text-lg font-semibold mb-3">
                {options.title ?? "入力"}
            </h2>
            {options.label && (
                <label className="block text-xs text-slate-300 mb-1">
                    {options.label}
                </label>
            )}
            <input
                type={options.type ?? "text"}
                className="w-full rounded-xl bg-slate-800 border border-slate-600 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder={options.placeholder}
                value={value}
                onChange={(e) => setValue(e.target.value)}
            />
            {error && (
                <p className="mt-1 text-xs text-red-400">
                    {error}
                </p>
            )}

            <div className="mt-4 flex justify-end gap-2 text-sm">
                <button
                    type="button"
                    onClick={handleCancel}
                    className="px-3 py-1.5 rounded-lg border border-slate-600 hover:bg-slate-800"
                >
                    {options.cancelText ?? "キャンセル"}
                </button>
                <button
                    type="button"
                    onClick={handleOk}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500"
                >
                    {options.okText ?? "OK"}
                </button>
            </div>
        </div>
    );
};


// useDialog.tsx の下の方に追加

type ProgressDialogOptions = {
    title?: string;
    message?: string;
    cancellable?: boolean;
    cancelText?: string;
    onCancel?: () => void;
};

const ProgressDialog: React.FC<{
    options: ProgressDialogOptions;
    onCancel?: () => void;
}> = ({ options, onCancel }) => {
    const { title, message, cancellable, cancelText } = options;

    return (
        <div className="w-full max-w-sm rounded-2xl bg-slate-900 p-6 shadow-xl border border-slate-700 text-slate-100">
            <h2 className="text-lg font-semibold mb-3">
                {title ?? "処理中…"}
            </h2>
            <div className="flex items-center gap-3">
                {/* 簡易スピナー */}
                <div className="w-5 h-5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-300">
                    {message ?? "しばらくお待ちください。"}
                </p>
            </div>

            {cancellable && (
                <div className="mt-4 flex justify-end">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-3 py-1.5 rounded-lg border border-slate-600 hover:bg-slate-800 text-xs"
                    >
                        {cancelText ?? "キャンセル"}
                    </button>
                </div>
            )}
        </div>
    );
};


// ----------------------
// 選択肢ダイアログ
// ----------------------

type SelectOption = {
    value: string;
    label: string;
    description?: React.ReactNode;
    disabled?: boolean;
};

type SelectDialogOptions = {
    title?: string;
    message?: React.ReactNode;
    options: SelectOption[];
    cancelText?: string;
};

const SelectDialog: React.FC<{
    options: SelectDialogOptions;
    onSelect: (value: string) => void;
    onCancel: () => void;
}> = ({ options, onSelect, onCancel }) => {
    return (
        <div className="w-full max-w-sm rounded-2xl bg-slate-900 p-6 shadow-xl border border-slate-700 text-slate-100">
            <h2 className="text-lg font-semibold mb-3">
                {options.title ?? "選択してください"}
            </h2>

            {options.message && (
                <div className="mb-3 text-xs text-slate-300">
                    {options.message}
                </div>
            )}

            <div className="space-y-2 max-h-64 overflow-y-auto">
                {options.options.map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        disabled={opt.disabled}
                        onClick={() => !opt.disabled && onSelect(opt.value)}
                        className={`
                            w-full text-left px-3 py-2 rounded-xl border text-xs
                            ${opt.disabled
                                ? "border-slate-700 text-slate-500 cursor-not-allowed"
                                : "border-slate-600 hover:bg-slate-800 cursor-pointer"
                            }
                        `}
                    >
                        <div className="font-medium text-slate-100">
                            {opt.label}
                        </div>
                        {opt.description && (
                            <div className="text-[11px] text-slate-400 mt-0.5">
                                {opt.description}
                            </div>
                        )}
                    </button>
                ))}
            </div>

            <div className="mt-4 flex justify-end">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-3 py-1.5 rounded-lg border border-slate-600 hover:bg-slate-800 text-xs text-slate-300"
                >
                    {options.cancelText ?? "キャンセル"}
                </button>
            </div>
        </div>
    );
};

type FileDialogOptions = {
    title?: string;
    message?: React.ReactNode;
    accept?: string;
    multiple?: boolean;
    okText?: string;
    cancelText?: string;
};

type FileDialogResult = {
    files: File[];
};

const FileDialog: React.FC<{
    options: FileDialogOptions;
    onSubmit: (files: File[]) => void;
    onCancel: () => void;
}> = ({ options, onSubmit, onCancel }) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const [dragActive, setDragActive] = React.useState(false);
    const [files, setFiles] = React.useState<File[]>([]);

    const setFromFileList = (list: FileList | null) => {
        if (!list || list.length === 0) {
            return;
        }
        setFiles(Array.from(list));
    };

    const handleChooseClick = () => {
        inputRef.current?.click();
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFromFileList(e.target.files);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dragActive) {
            setDragActive(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        const dropped = e.dataTransfer?.files;
        if (dropped && dropped.length > 0) {
            const nextFiles = Array.from(dropped);
            setFiles(options.multiple ? nextFiles : [nextFiles[0]]);
        }
    };

    const handleOk = () => {
        if (files.length === 0) {
            return;
        }
        onSubmit(options.multiple ? files : [files[0]]);
    };

    return (
        <div className="w-full max-w-lg rounded-2xl bg-slate-900 p-6 shadow-xl border border-slate-700 text-slate-100">
            <h2 className="text-lg font-semibold mb-3">
                {options.title ?? "Select File"}
            </h2>

            {options.message && (
                <div className="mb-3 text-xs text-slate-300">
                    {options.message}
                </div>
            )}

            <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept={options.accept}
                multiple={options.multiple}
                onChange={handleInputChange}
            />

            <div
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={[
                    "rounded-2xl border-2 border-dashed p-6 text-center transition-colors",
                    dragActive
                        ? "border-emerald-400 bg-emerald-500/10"
                        : "border-slate-600 bg-slate-800/40",
                ].join(" ")}
            >
                <p className="text-sm font-medium text-slate-100">
                    Drag & Drop files here
                </p>
                <p className="mt-1 text-xs text-slate-400">
                    or choose files using the button below
                </p>

                <button
                    type="button"
                    onClick={handleChooseClick}
                    className="mt-4 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm"
                >
                    Choose Files
                </button>
            </div>

            <div className="mt-4 max-h-40 overflow-y-auto rounded-xl border border-slate-700 bg-slate-800/50 p-3">
                {files.length === 0 ? (
                    <p className="text-xs text-slate-400">
                        No files selected yet
                    </p>
                ) : (
                    <ul className="space-y-1">
                        {files.map((file, index) => (
                            <li key={`${file.name}-${index}`} className="text-xs text-slate-200">
                                <div className="font-medium">{file.name}</div>
                                <div className="text-slate-400">
                                    type: {file.type || "(unknown)"} / size: {file.size.toLocaleString()} bytes
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="mt-4 flex justify-end gap-2 text-sm">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-3 py-1.5 rounded-lg border border-slate-600 hover:bg-slate-800"
                >
                    {options.cancelText ?? "Cancel"}
                </button>
                <button
                    type="button"
                    disabled={files.length === 0}
                    onClick={handleOk}
                    className={[
                        "px-3 py-1.5 rounded-lg",
                        files.length === 0
                            ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                            : "bg-emerald-600 hover:bg-emerald-500 text-white",
                    ].join(" ")}
                >
                    {options.okText ?? "OK"}
                </button>
            </div>
        </div>
    );
};
// ----------------------
// 公開フック
// ----------------------

type ShowDialogHelpers<T> = {
    resolve: (value: T | null) => void;
    close: () => void; // resolve(null) のショートカット
};


// eslint-disable-next-line react-refresh/only-export-components
export function useDialog() {
    const { push, pop } = useDialogCore();

    /**
     * 汎用 showDialog
     * 例:
     *   const { showDialog } = useDialog();
     *   const result = await showDialog<boolean>(({ resolve, close }) => (
     *     <MyConfirmDialog onOk={() => resolve(true)} onCancel={close} />
     *   ));
     */
    const showDialog = useCallback(
        <T,>(
            render: (helpers: ShowDialogHelpers<T>) => ReactNode
        ): Promise<T | null> => {
            return new Promise<T | null>((outerResolve) => {
                const id = crypto.randomUUID();

                const resolve = (value: T | null) => {
                    outerResolve(value);
                    pop(id);
                };

                const close = () => resolve(null);

                const node = render({ resolve, close });

                push({ id, node });
            });
        },
        [push, pop]
    );

    /**
     * 汎用テキスト入力ダイアログ
     */
    const showInputDialog = useCallback(
        (options: TextInputDialogOptions): Promise<string | null> => {
            return showDialog<string>(({ resolve, close }) => (
                <TextInputDialog
                    options={options}
                    onSubmit={(v) => resolve(v)}
                    onCancel={close}
                />
            ));
        },
        [showDialog]
    );

    /**
     * パスワード入力ダイアログ
     */
    const showInputPasswordDialog = useCallback(
        (opts?: Omit<TextInputDialogOptions, "type">) => {
            return showInputDialog({
                type: "password",
                title: opts?.title ?? "パスフレーズを入力",
                label: opts?.label ?? "パスフレーズ",
                placeholder: opts?.placeholder ?? "",
                okText: opts?.okText ?? "OK",
                cancelText: opts?.cancelText ?? "キャンセル",
                validate: opts?.validate,
            });
        },
        [showInputDialog]
    );
    // useDialog の中に追加
    type SimpleDialogOptions = {
        title: string;
        body: React.ReactNode;
        okText?: string;
        cancelText?: string;
    };

    const showConfirmDialog = useCallback(
        (opts: SimpleDialogOptions): Promise<boolean | null> => {
            return showDialog<boolean>(({ resolve, close }) => (
                <div className="w-full max-w-sm rounded-2xl bg-slate-900 p-6 shadow-xl border border-slate-700">
                    <h2 className="text-lg font-semibold mb-3 text-slate-300">{opts.title}</h2>
                    <div className="text-xs text-slate-300">{opts.body}</div>

                    <div className="mt-4 flex justify-end gap-2 text-sm">
                        <button
                            type="button"
                            onClick={close}
                            className="px-3 py-1.5 rounded-lg border border-slate-600 hover:bg-slate-800  text-slate-300"
                        >
                            {opts.cancelText ?? "キャンセル"}
                        </button>
                        <button
                            type="button"
                            onClick={() => resolve(true)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500  text-slate-300"
                        >
                            {opts.okText ?? "OK"}
                        </button>
                    </div>
                </div>
            ));
        },
        [showDialog]
    );

    type ImageConfirmDialogOptions = {
        title?: string;
        message?: React.ReactNode;
        imageUrl: string;
        imageAlt?: string;
        okText?: string;
        cancelText?: string;
    };

    const showImageConfirmDialog = useCallback(
        (opts: ImageConfirmDialogOptions): Promise<boolean | null> => {
            return showDialog<boolean>(({ resolve, close }) => (
                <div className="flex w-[min(96vw,1200px)] max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-xl">
                    <div className="shrink-0 border-b border-slate-700 px-4 py-3">
                        <h2 className="text-lg font-semibold text-slate-100">
                            {opts.title ?? "画像を確認"}
                        </h2>
                        {opts.message && (
                            <div className="mt-1 text-sm text-slate-300">
                                {opts.message}
                            </div>
                        )}
                    </div>

                    <div className="min-h-0 flex-1 overflow-auto bg-black">
                        <img
                            src={opts.imageUrl}
                            alt={opts.imageAlt ?? "preview"}
                            className="block w-full h-auto"
                        />
                    </div>

                    <div className="shrink-0 border-t border-slate-700 px-4 py-3">
                        <div className="flex justify-end gap-2 text-sm">
                            <button
                                type="button"
                                onClick={close}
                                className="rounded-lg border border-slate-600 px-3 py-1.5 text-slate-300 hover:bg-slate-800"
                            >
                                {opts.cancelText ?? "キャンセル"}
                            </button>
                            <button
                                type="button"
                                onClick={() => resolve(true)}
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-slate-100 hover:bg-emerald-500"
                            >
                                {opts.okText ?? "OK"}
                            </button>
                        </div>
                    </div>
                </div>
            ));
        },
        [showDialog]
    );
    const showProgressDialog = React.useCallback(
        (options: ProgressDialogOptions): { close: () => void } => {
            const id = crypto.randomUUID();

            const handleCancel = () => {
                if (options.onCancel) {
                    options.onCancel();
                }
                pop(id);
            };

            const node = (
                <ProgressDialog
                    options={options}
                    onCancel={options.cancellable ? handleCancel : undefined}
                />
            );

            push({ id, node });

            return {
                close: () => {
                    pop(id);
                },
            };
        },
        [push, pop]
    );

    const showSelectDialog = useCallback(
        (opts: SelectDialogOptions): Promise<string | null> => {
            return showDialog<string>(({ resolve, close }) => (
                <SelectDialog
                    options={opts}
                    onSelect={(value) => resolve(value)}
                    onCancel={close}
                />
            ));
        },
        [showDialog]
    );

    const showFileDialog = useCallback(
        (options?: FileDialogOptions): Promise<FileDialogResult | null> => {
            return showDialog<FileDialogResult>(({ resolve, close }) => (
                <FileDialog
                    options={options ?? {}}
                    onSubmit={(files) => resolve({ files })}
                    onCancel={close}
                />
            ));
        },
        [showDialog]
    );
    // return に追加
    return {
        showDialog,
        showInputDialog,
        showInputPasswordDialog,
        showConfirmDialog,
        showImageConfirmDialog,
        showProgressDialog,
        showSelectDialog,
        showFileDialog,
        push, pop
    };
}

export type UseDialogReturn = ReturnType<typeof useDialog>;
